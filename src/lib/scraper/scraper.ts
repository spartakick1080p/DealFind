/**
 * Scrape job orchestrator.
 *
 * Fetches all active monitored websites and their product page URLs,
 * parses product data, evaluates variants against active filters,
 * tracks seen items to avoid duplicates, and creates notifications
 * for new deals.
 */

import { db } from '@/db';
import { deals, filters, monitoredWebsites, productPageUrls, scrapeRuns, websiteFilters, urlFilters } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

import { fetchWithRetry, fetchApiJson, interpolateEnvVars, type HttpClientConfig } from './http-client';
import {
  parseNextData,
  extractProductVariants,
  isListingPage,
  getPageCount,
  type ProductVariant,
} from './parser';
import { parseWithSchema, parseFromApiData, parseSchemaJson, resetDebugSampleCount, parseItemSelector, escapeRegex, type ProductPageSchema, type ApiPaginationConfig } from './schema-parser';
import { findMatchingFilters, type FilterCriteria } from '@/lib/filter-engine';
import { isNewDeal, markAsSeen, cleanExpiredItems } from '@/lib/seen-tracker';
import { createNotification } from '@/lib/notification-service';
import { dispatchWebhooks, type DealPayload } from '@/lib/webhook-service';
import { decrypt } from '@/lib/crypto';
import {
  createJob as _createJob,
  resetProgress as _resetProgress,
  updateProgress as _updateProgress,
  completeProgress as _completeProgress,
  failProgress as _failProgress,
  trackUniqueProduct as _trackUniqueProduct,
  getUniqueProductCount as _getUniqueProductCount,
  isCancelled as _isCancelled,
  getJobSource,
  type ScrapeProgress,
} from '@/lib/scrape-progress';

// ---------------------------------------------------------------------------
// Module-level job ID — set once per executeScrapeJob call.
// Internal helpers read this so we don't have to thread jobId everywhere.
// ---------------------------------------------------------------------------
let _currentJobId = '';

function resetProgress() { _resetProgress(_currentJobId); }
function updateProgress(u: Partial<ScrapeProgress>) { _updateProgress(_currentJobId, u); }
function completeProgress(t: number, n: number) { _completeProgress(_currentJobId, t, n); }
function failProgress(m: string) { _failProgress(_currentJobId, m); }
function trackUniqueProduct(id: string) { return _trackUniqueProduct(_currentJobId, id); }
function getUniqueProductCount() { return _getUniqueProductCount(_currentJobId); }
function isCancelled() { return _isCancelled(_currentJobId); }

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapeError {
  url: string;
  message: string;
}

export interface ScrapeResult {
  totalProductsEncountered: number;
  newDealsFound: number;
  durationMs: number;
  errors: ScrapeError[];
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_HTTP_CONFIG: HttpClientConfig = {
  rateLimit: 350,
  maxRetries: 3,
  backoffBase: 800,
  backoffMax: 8000,
  timeout: 12000,
};

const DEFAULT_MAX_PAGES = 2000;
const DEFAULT_TTL_DAYS = 7;

// ---------------------------------------------------------------------------
// Internal: best-variant-per-product grouping
// ---------------------------------------------------------------------------

/**
 * Group variants by productId and pick the single best in-stock variant
 * per product (highest discount, then lowest bestPrice as tiebreaker).
 * Out-of-stock variants are excluded. Products with no in-stock variants
 * are dropped entirely. All variants are tracked as unique products for
 * progress reporting regardless of stock status.
 */
function pickBestVariantPerProduct(variants: ProductVariant[]): ProductVariant[] {
  const byProduct = new Map<string, ProductVariant>();

  for (const v of variants) {
    trackUniqueProduct(v.compositeId);
    if (!v.inStock) continue;

    const existing = byProduct.get(v.productId);
    if (
      !existing ||
      v.discountPercentage > existing.discountPercentage ||
      (v.discountPercentage === existing.discountPercentage && v.bestPrice < existing.bestPrice)
    ) {
      byProduct.set(v.productId, v);
    }
  }

  return Array.from(byProduct.values());
}

// ---------------------------------------------------------------------------
// Internal: resolve relative product URLs to full URLs
// ---------------------------------------------------------------------------

function resolveFullUrl(productUrl: string, baseUrl?: string): string {
  if (!productUrl) return '';
  if (productUrl.startsWith('http')) return productUrl;
  const base = baseUrl?.replace(/\/+$/, '') ?? '';
  const path = productUrl.startsWith('/') ? productUrl : `/${productUrl}`;
  return base ? `${base}${path}` : productUrl;
}

// ---------------------------------------------------------------------------
// Internal: map DB filter rows to FilterCriteria + id
// ---------------------------------------------------------------------------

interface FilterWithId extends FilterCriteria {
  id: string;
}

function toFilterWithId(row: {
  id: string;
  discountThreshold: number;
  maxPrice: string | null;
  keywords: string[] | null;
  includedCategories: string[] | null;
  excludedCategories: string[] | null;
}): FilterWithId {
  return {
    id: row.id,
    discountThreshold: row.discountThreshold,
    maxPrice: row.maxPrice !== null ? Number(row.maxPrice) : null,
    keywords: row.keywords ?? [],
    includedCategories: row.includedCategories ?? [],
    excludedCategories: row.excludedCategories ?? [],
  };
}

// ---------------------------------------------------------------------------
// Internal: resolve effective filters for a URL
// Priority: URL-level > website-level > all active filters
// ---------------------------------------------------------------------------

async function resolveFiltersForUrl(
  urlId: string,
  websiteId: string,
  allActiveFilters: FilterWithId[],
): Promise<FilterWithId[]> {
  // 1. Check URL-level filter assignments
  const urlFilterRows = await db
    .select({ filterId: urlFilters.filterId })
    .from(urlFilters)
    .where(eq(urlFilters.urlId, urlId));

  if (urlFilterRows.length > 0) {
    const urlFilterIds = new Set(urlFilterRows.map((r) => r.filterId));
    const resolved = allActiveFilters.filter((f) => urlFilterIds.has(f.id));
    if (resolved.length > 0) {
      console.log(`[scraper] URL ${urlId}: using ${resolved.length} URL-level filter(s)`);
      return resolved;
    }
    // All assigned filters are inactive — fall through to website level
  }

  // 2. Check website-level filter assignments
  const wsFilterRows = await db
    .select({ filterId: websiteFilters.filterId })
    .from(websiteFilters)
    .where(eq(websiteFilters.websiteId, websiteId));

  if (wsFilterRows.length > 0) {
    const wsFilterIds = new Set(wsFilterRows.map((r) => r.filterId));
    const resolved = allActiveFilters.filter((f) => wsFilterIds.has(f.id));
    if (resolved.length > 0) {
      console.log(`[scraper] URL ${urlId}: using ${resolved.length} website-level filter(s)`);
      return resolved;
    }
    // All assigned filters are inactive — fall through to all
  }

  // 3. No assignments — use all active filters
  return allActiveFilters;
}

// ---------------------------------------------------------------------------
// Internal: process a single URL (may follow pagination)
// ---------------------------------------------------------------------------

async function processUrl(
  url: string,
  activeFilters: FilterWithId[],
  httpConfig: HttpClientConfig,
  maxPages: number,
  ttlDays: number,
  result: { totalProducts: number; newDeals: number },
  errors: ScrapeError[],
  pageProgress: { completed: number; total: number },
  customSchema?: ProductPageSchema,
  authToken?: string,
  seenIds?: Set<string>,
  baseUrl?: string,
  webhookDeals?: DealPayload[],
  onBatchReady?: () => Promise<void>,
  websiteName?: string,
  diagnostics?: Map<string, string>,
): Promise<void> {
  // If a custom schema is provided, use the schema-driven parser
  if (customSchema) {
    // api-json: fetch from API directly — skip HTML fetch entirely
    if (customSchema.extraction.method === 'api-json' && customSchema.extraction.apiUrl) {
      // Merge query params from the product page URL into the schema's static params.
      // This allows each URL (e.g. ?pageCategories=Electronics) to customise the API call.
      const mergedParams = { ...customSchema.extraction.apiParams };
      try {
        const pageUrl = new URL(url);
        pageUrl.searchParams.forEach((value, key) => {
          mergedParams[key] = value;
        });
      } catch {
        // URL parse failed — use schema defaults only
      }

      const pagination = customSchema.extraction.pagination;

      if (pagination) {
        // Paginated API fetching
        await fetchApiWithPagination(
          customSchema, mergedParams, pagination, authToken,
          url, maxPages, activeFilters, ttlDays, result, errors, pageProgress, seenIds, baseUrl, webhookDeals, onBatchReady, websiteName,
        );
      } else {
        // Single-page API fetch (no pagination)
        // (total already counted by pre-scan)
        const apiResult = await fetchApiJson(customSchema.extraction.apiUrl!, {
          method: customSchema.extraction.apiMethod,
          params: mergedParams,
          headers: customSchema.extraction.apiHeaders,
          body: customSchema.extraction.apiBody,
          authToken,
        });

        if (!apiResult) {
          errors.push({ url, message: 'API request failed for api-json schema' });
          return;
        }

        const { variants, diagnostic } = parseFromApiData(apiResult.data, customSchema);
        if (variants.length === 0 && diagnostic && diagnostics) {
          diagnostics.set(url, diagnostic);
        }
        result.totalProducts += variants.length;
        const bestVariants = pickBestVariantPerProduct(variants);
        for (const variant of bestVariants) {
          if (seenIds) {
            if (seenIds.has(variant.productId)) continue;
            seenIds.add(variant.productId);
          }
          await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady, websiteName);
        }
        pageProgress.completed += 1;
        updateProgress({ currentPage: pageProgress.completed, totalPages: pageProgress.total, totalProducts: result.totalProducts, newDeals: result.newDeals, uniqueProducts: getUniqueProductCount() });
      }
      return;
    }
  }

  // Fetch the page HTML (needed for HTML-based schemas and default parser)
  // Build custom headers for html-dom schemas (e.g. Cookie for session auth)
  let fetchHeaders: Record<string, string> | undefined;
  if (customSchema?.extraction.apiHeaders) {
    fetchHeaders = {};
    for (const [key, value] of Object.entries(customSchema.extraction.apiHeaders)) {
      fetchHeaders[key] = interpolateEnvVars(value, authToken);
    }
    // Debug: log header keys (not values, to avoid leaking secrets)
    const headerKeys = Object.keys(fetchHeaders);
    const cookiePreview = fetchHeaders['Cookie']
      ? `Cookie=${fetchHeaders['Cookie'].slice(0, 30)}...`
      : 'no Cookie';
    console.log(
      `[scraper] html-dom headers: [${headerKeys.join(', ')}], ${cookiePreview}, ` +
      `authToken ${authToken ? 'present (' + authToken.length + ' chars)' : 'MISSING'}`,
    );
  }

  // (total already counted by pre-scan)
  const response = await fetchWithRetry(url, httpConfig, fetchHeaders ? { headers: fetchHeaders } : undefined);
  if (!response) {
    errors.push({ url, message: 'Failed to fetch (retries exhausted or unreachable)' });
    return;
  }
  let html = await response.text();

  // Debug: check if auth-gated content (like prices) is present in the fetched HTML
  if (customSchema?.extraction.method === 'html-dom') {
    const hasFinalPriceValues = /finalPrice_\d+" value="[\d.]+"/i.test(html);
    const salePriceCount = (html.match(/product-card_price_sale/g) || []).length;
    console.log(
      `[scraper] html-dom fetch debug: ${html.length} chars, ` +
      `finalPrice values populated: ${hasFinalPriceValues}, ` +
      `sale price elements: ${salePriceCount}`,
    );

    // If no prices found and a login config exists, attempt to log in and retry
    if (!hasFinalPriceValues && salePriceCount === 0 && customSchema.extraction.login) {
      const loginConfig = customSchema.extraction.login;
      console.log(`[scraper] Attempting login via ${loginConfig.url} to refresh session...`);

      try {
        // Build login form body with env var interpolation
        const loginBody = new URLSearchParams();
        for (const [key, value] of Object.entries(loginConfig.fields)) {
          loginBody.set(key, interpolateEnvVars(value, authToken));
        }

        // First, GET the login page to obtain a fresh session cookie + _dynSessConf
        const preLoginRes = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': fetchHeaders?.['User-Agent'] ?? 'Mozilla/5.0',
          },
          redirect: 'manual',
        });

        // Capture the fresh session cookie from the pre-login response
        let freshSessionCookie = '';
        const setCookies = preLoginRes.headers.getSetCookie?.() ?? [];
        for (const sc of setCookies) {
          if (sc.startsWith(loginConfig.sessionCookie + '=')) {
            freshSessionCookie = sc.split(';')[0].split('=').slice(1).join('=');
            break;
          }
        }

        if (!freshSessionCookie) {
          // Fallback: parse from raw header
          const rawSetCookie = preLoginRes.headers.get('set-cookie') ?? '';
          const cookieMatch = new RegExp(`${loginConfig.sessionCookie}=([^;]+)`).exec(rawSetCookie);
          if (cookieMatch) freshSessionCookie = cookieMatch[1];
        }

        if (!freshSessionCookie) {
          console.warn('[scraper] Could not obtain fresh session cookie from pre-login request');
        } else {
          console.log(`[scraper] Got fresh ${loginConfig.sessionCookie} (${freshSessionCookie.length} chars)`);

          // POST login with the fresh session cookie
          const loginRes = await fetch(loginConfig.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': `${loginConfig.sessionCookie}=${freshSessionCookie}`,
              'User-Agent': fetchHeaders?.['User-Agent'] ?? 'Mozilla/5.0',
            },
            body: loginBody.toString(),
            redirect: 'manual',
          });

          // Check if login succeeded (usually a 302 redirect)
          console.log(`[scraper] Login response: ${loginRes.status}`);

          // The session cookie may have been rotated — capture the new one
          const postLoginCookies = loginRes.headers.getSetCookie?.() ?? [];
          for (const sc of postLoginCookies) {
            if (sc.startsWith(loginConfig.sessionCookie + '=')) {
              freshSessionCookie = sc.split(';')[0].split('=').slice(1).join('=');
              break;
            }
          }

          // Update fetchHeaders with the authenticated session cookie
          const cookieName = loginConfig.cookieHeader ?? loginConfig.sessionCookie;
          if (fetchHeaders) {
            fetchHeaders['Cookie'] = `${cookieName}=${freshSessionCookie}`;
          }

          // Retry the original page fetch with the authenticated session
          console.log(`[scraper] Retrying page fetch with authenticated session...`);
          const retryResponse = await fetchWithRetry(url, httpConfig, fetchHeaders ? { headers: fetchHeaders } : undefined);
          if (retryResponse) {
            html = await retryResponse.text();
            const retryHasPrices = /finalPrice_\d+" value="[\d.]+"/i.test(html);
            const retrySaleCount = (html.match(/product-card_price_sale/g) || []).length;
            console.log(
              `[scraper] Post-login fetch: ${html.length} chars, ` +
              `finalPrice populated: ${retryHasPrices}, sale prices: ${retrySaleCount}`,
            );
            if (!retryHasPrices && retrySaleCount === 0) {
              console.warn('[scraper] ⚠ Login did not resolve missing prices — credentials may be invalid');
              errors.push({ url, message: 'Session expired and auto-login failed to restore prices. Check login credentials.' });
            }
          }
        }
      } catch (loginErr) {
        const msg = loginErr instanceof Error ? loginErr.message : String(loginErr);
        console.error(`[scraper] Login attempt failed: ${msg}`);
      }
    } else if (!hasFinalPriceValues && salePriceCount === 0) {
      console.warn(
        `[scraper] ⚠ No price data found in HTML — the session cookie may be expired or invalid. ` +
        `Check that the auth token for this website is current.`,
      );
    }
  }

  if (customSchema) {
    // HTML-based custom schema — parse first page
    let allVariants: ProductVariant[] = [];
    const { variants, diagnostic } = parseWithSchema(html, customSchema);
    allVariants.push(...variants);

    // html-dom pagination: fetch additional pages if configured
    if (customSchema.extraction.method === 'html-dom' && customSchema.extraction.htmlPagination) {
      const htmlPag = customSchema.extraction.htmlPagination;
      const pageSize = htmlPag.pageSize ?? 32;
      const htmlMaxPages = Math.min(htmlPag.maxPages ?? 50, maxPages);

      console.log(
        `[scraper] html-dom pagination: starting with ${allVariants.length} variants from page 1, ` +
        `pageSize=${pageSize}, maxPages=${htmlMaxPages}, urlTemplate=${htmlPag.urlTemplate.slice(0, 120)}`,
      );

      let consecutiveEmpty = 0;
      let actualPagesScraped = 1; // page 1 already fetched above

      // We already have page 1 (offset 0). Fetch remaining pages.
      for (let page = 1; page < htmlMaxPages; page++) {
        if (isCancelled()) break;
        const offset = page * pageSize;
        const pagedUrl = htmlPag.urlTemplate.replace('{offset}', String(offset));
        const fullPagedUrl = pagedUrl.startsWith('http') ? pagedUrl : `${baseUrl ?? ''}${pagedUrl}`;

        console.log(`[scraper] html-dom pagination: fetching page ${page + 1} — ${fullPagedUrl}`);

        // (total already counted by pre-scan)
        const pageResponse = await fetchWithRetry(fullPagedUrl, httpConfig, fetchHeaders ? { headers: fetchHeaders } : undefined);
        if (!pageResponse) {
          errors.push({ url: fullPagedUrl, message: 'Failed to fetch html-dom pagination page' });
          pageProgress.completed += 1;
          actualPagesScraped++;
          console.warn(`[scraper] html-dom pagination: page ${page + 1} fetch FAILED (retries exhausted)`);
          continue;
        }

        // Log response status and check for redirects
        console.log(`[scraper] html-dom pagination: page ${page + 1} response status=${pageResponse.status}, url=${pageResponse.url}`);

        const pageHtml = await pageResponse.text();

        // Debug: log HTML size and key content indicators
        const itemSelector = customSchema.extraction.itemSelector ?? '';
        const { className: itemClass } = parseItemSelector(itemSelector);
        const itemMatches = itemClass ? (pageHtml.match(new RegExp(escapeRegex(itemClass), 'g')) || []).length : 0;
        const hasSalePrices = (pageHtml.match(/product-card_price_sale/g) || []).length;
        const hasFinalPrices = /finalPrice_\d+" value="[\d.]+"/i.test(pageHtml);
        const isErrorPage = /<title[^>]*>\s*(error|404|not found|access denied)/i.test(pageHtml);

        console.log(
          `[scraper] html-dom pagination: page ${page + 1} debug — ` +
          `htmlSize=${pageHtml.length}, itemClass="${itemClass}" occurrences=${itemMatches}, ` +
          `salePriceElements=${hasSalePrices}, finalPricePopulated=${hasFinalPrices}, ` +
          `looksLikeErrorPage=${isErrorPage}`,
        );

        const { variants: pageVariants } = parseWithSchema(pageHtml, customSchema);

        console.log(`[scraper] html-dom pagination: page ${page + 1} parsed ${pageVariants.length} variants`);

        // Stop if we get an empty page (no more products)
        if (pageVariants.length === 0) {
          consecutiveEmpty++;
          pageProgress.completed += 1;
          actualPagesScraped++;

          // Log a snippet of the HTML to help diagnose why 0 products were found
          if (pageHtml.length < 5000) {
            console.warn(`[scraper] html-dom pagination: page ${page + 1} returned 0 products — HTML is very small (${pageHtml.length} chars), likely an error/redirect page`);
          } else {
            // Check if the page has product cards but they just lack valid productIds
            console.warn(
              `[scraper] html-dom pagination: page ${page + 1} returned 0 products — ` +
              `HTML has ${pageHtml.length} chars with ${itemMatches} "${itemClass}" occurrences. ` +
              `${consecutiveEmpty} consecutive empty page(s).`,
            );
          }

          if (consecutiveEmpty >= 2) {
            console.log(`[scraper] html-dom pagination: ${consecutiveEmpty} consecutive empty pages — stopping`);
            break;
          }
          // Try one more page before giving up (the site might skip a page)
          continue;
        }

        consecutiveEmpty = 0;
        allVariants.push(...pageVariants);
        pageProgress.completed += 1;
        actualPagesScraped++;
        updateProgress({ currentPage: pageProgress.completed, totalPages: pageProgress.total, totalProducts: result.totalProducts + allVariants.length, newDeals: result.newDeals, uniqueProducts: getUniqueProductCount() });
      }

      console.log(`[scraper] html-dom pagination complete: ${allVariants.length} total variants across all pages`);

      // Correct the pre-scanned total if we stopped early (empty pages / cancellation).
      const estimatedPagesForUrl = htmlMaxPages;
      if (actualPagesScraped < estimatedPagesForUrl) {
        pageProgress.total -= (estimatedPagesForUrl - actualPagesScraped);
      }
    }

    result.totalProducts += allVariants.length;
    // Capture diagnostic if 0 products found across all pages
    if (allVariants.length === 0 && diagnostic && diagnostics) {
      diagnostics.set(url, diagnostic);
    }
    const bestVariants = pickBestVariantPerProduct(allVariants);
    for (const variant of bestVariants) {
      if (seenIds) {
        if (seenIds.has(variant.productId)) continue;
        seenIds.add(variant.productId);
      }
      await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady, websiteName,
        fetchHeaders ? { httpConfig, fetchHeaders } : undefined);
    }
    pageProgress.completed += 1;
    updateProgress({ currentPage: pageProgress.completed, totalPages: pageProgress.total, totalProducts: result.totalProducts, newDeals: result.newDeals, uniqueProducts: getUniqueProductCount() });
    return;
  }

  // Default: use the original __NEXT_DATA__ parser
  const payload = parseNextData(html);
  if (!payload) {
    errors.push({ url, message: 'Could not parse __NEXT_DATA__ from page' });
    return;
  }

  // Extract variants from the first page
  let allVariants: ProductVariant[] = extractProductVariants(payload);

  // If listing page, follow pagination up to maxPages
  if (isListingPage(payload)) {
    const pageCount = Math.min(getPageCount(payload), maxPages);
    // If the actual page count exceeds what pre-scan estimated (e.g. pre-scan
    // failed and defaulted to 1), bump the total to stay accurate.
    const extraPages = pageCount - 1; // pages beyond the first
    if (extraPages > 0) {
      const neededTotal = pageProgress.completed + extraPages + 1;
      if (neededTotal > pageProgress.total) {
        pageProgress.total += (neededTotal - pageProgress.total);
        updateProgress({ totalPages: pageProgress.total });
      }
    }

    for (let page = 2; page <= pageCount; page++) {
      if (isCancelled()) break;
      const separator = url.includes('?') ? '&' : '?';
      const pagedUrl = `${url}${separator}pageNo=${page}`;

      const pageResponse = await fetchWithRetry(pagedUrl, httpConfig);
      if (!pageResponse) {
        errors.push({ url: pagedUrl, message: 'Failed to fetch pagination page' });
        pageProgress.completed += 1;
        continue;
      }

      const pageHtml = await pageResponse.text();
      const pagePayload = parseNextData(pageHtml);
      if (!pagePayload) {
        errors.push({ url: pagedUrl, message: 'Could not parse __NEXT_DATA__ from pagination page' });
        pageProgress.completed += 1;
        continue;
      }

      allVariants.push(...extractProductVariants(pagePayload));
      pageProgress.completed += 1;
      updateProgress({ currentPage: pageProgress.completed, totalPages: pageProgress.total, totalProducts: result.totalProducts, newDeals: result.newDeals, uniqueProducts: getUniqueProductCount() });
    }
  }

  result.totalProducts += allVariants.length;

  // Evaluate best variant per product against filters
  const bestVariants = pickBestVariantPerProduct(allVariants);
  for (const variant of bestVariants) {
    if (seenIds) {
      if (seenIds.has(variant.productId)) continue;
      seenIds.add(variant.productId);
    }
    await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady, websiteName);
  }

  pageProgress.completed += 1;
  updateProgress({ currentPage: pageProgress.completed, totalPages: pageProgress.total, totalProducts: result.totalProducts, newDeals: result.newDeals, uniqueProducts: getUniqueProductCount() });
}

// ---------------------------------------------------------------------------
// Internal: paginated API fetching for api-json schemas
// ---------------------------------------------------------------------------

/** Fetch a single API page with retry logic. Returns null on permanent failure. */
async function fetchApiPage(
  schema: ProductPageSchema,
  mergedParams: Record<string, string>,
  pagination: ApiPaginationConfig,
  authToken: string | undefined,
  offset: number,
  pageNum: number,
): Promise<{ data: unknown } | null> {
  const pageSize = pagination.pageSize ?? 120;
  const offsetParam = pagination.offsetParam ?? 'offset';
  const limitParam = pagination.limitParam ?? 'limit';
  const paginationIn = pagination.paginationIn ?? 'body';

  const paginationValue = pagination.style === 'offset' ? offset : pageNum + 1;

  const body: Record<string, unknown> = {
    ...schema.extraction.apiBody,
  };

  // Build query params for pagination if needed
  const queryParams: Record<string, string> = {};

  if (paginationIn === 'query') {
    // When pagination is via query params, send ALL merged params (including
    // URL-derived params like pageCategories) as query params too — the API
    // expects them there, not in the POST body.
    for (const [key, value] of Object.entries(mergedParams)) {
      queryParams[key] = value;
    }

    // Send pagination as URL query parameters
    if (pagination.cursorTemplate) {
      queryParams[offsetParam] = pagination.cursorTemplate.replace('{offset}', String(paginationValue));
    } else {
      queryParams[offsetParam] = String(paginationValue);
    }
    if (!pagination.cursorTemplate) {
      queryParams[limitParam] = String(pageSize);
    }
  } else {
    // When pagination is in the body, merge params into the body as before
    for (const [key, value] of Object.entries(mergedParams)) {
      body[key] = value;
    }
    // Send pagination in the POST body (original behaviour)
    body[offsetParam] = paginationValue;
    body[limitParam] = pageSize;
  }

  // Debug: log the actual body being sent for the first few pages
  if (pageNum < 3) {
    console.log(
      `[scraper] fetchApiPage body for page ${pageNum + 1} (offset=${offset}): ${JSON.stringify(body).slice(0, 500)}` +
      (Object.keys(queryParams).length > 0 ? ` queryParams: ${JSON.stringify(queryParams)}` : ''),
    );
  }

  // Retry up to 3 times with increasing backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await fetchApiJson(schema.extraction.apiUrl!, {
      method: schema.extraction.apiMethod,
      params: queryParams,
      headers: schema.extraction.apiHeaders,
      body,
      authToken,
    });
    if (result) return result;
    console.warn(
      `[scraper] API page offset=${offset} failed (attempt ${attempt + 1}/3), retrying in ${attempt + 1}s...`,
    );
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  return null;
}

/** How many pages to fetch in parallel at once */
const API_CONCURRENCY = 5;

async function fetchApiWithPagination(
  schema: ProductPageSchema,
  mergedParams: Record<string, string>,
  pagination: ApiPaginationConfig,
  authToken: string | undefined,
  url: string,
  maxPages: number,
  activeFilters: FilterWithId[],
  ttlDays: number,
  result: { totalProducts: number; newDeals: number },
  errors: ScrapeError[],
  pageProgress: { completed: number; total: number },
  seenIds?: Set<string>,
  baseUrl?: string,
  webhookDeals?: DealPayload[],
  onBatchReady?: () => Promise<void>,
  websiteName?: string,
): Promise<void> {
  const pageSize = pagination.pageSize ?? 120;
  const totalPath = pagination.totalPath ?? 'total';

  // --- First request: get total count ---
  const firstResult = await fetchApiPage(schema, mergedParams, pagination, authToken, 0, 0);
  if (!firstResult) {
    errors.push({ url, message: 'API pagination failed on first page after 3 retries' });
    return;
  }

  // Debug: log top-level response keys and any pagination-related fields
  if (firstResult.data && typeof firstResult.data === 'object') {
    const keys = Object.keys(firstResult.data as Record<string, unknown>);
    console.log(`[scraper] *** FIRST PAGE RESPONSE KEYS: [${keys.join(', ')}]`);
    const d = firstResult.data as Record<string, unknown>;
    // Log scalar fields and stringify objects for pagination hints
    for (const k of ['total', 'pageSize', 'pageCount', 'query', 'correctedQuery', 'id']) {
      if (d[k] !== undefined) {
        console.log(`[scraper] *** "${k}" = ${JSON.stringify(d[k])?.slice(0, 500)}`);
      }
    }
  }

  let totalItems = 0;
  const resolvedTotal = resolveDotPath(firstResult.data, totalPath);

  // Process first page results early so we can use the count for validation
  const firstVariants = parseFromApiData(firstResult.data, schema);

  console.log(
    `[scraper] totalPath="${totalPath}" resolved to ${JSON.stringify(resolvedTotal)} ` +
    `(type: ${typeof resolvedTotal}), first page variants: ${firstVariants.variants.length}, pageSize: ${pageSize}`,
  );

  if (typeof resolvedTotal === 'number' && resolvedTotal > 0) {
    // Sanity check: if the "total" is <= the number of items on the first page,
    // it's almost certainly a per-page count rather than the grand total.
    // In that case, fall through to the unknown-total sequential pagination.
    if (resolvedTotal <= firstVariants.variants.length && firstVariants.variants.length >= pageSize) {
      console.warn(
        `[scraper] totalPath "${totalPath}" resolved to ${resolvedTotal} but first page already has ` +
        `${firstVariants.variants.length} items (pageSize=${pageSize}). This looks like a per-page count, ` +
        `not the grand total. Will paginate until an empty page is returned.`,
      );
      // leave totalItems = 0 to trigger sequential pagination
    } else {
      totalItems = resolvedTotal;
    }
  } else {
    console.warn(
      `[scraper] Could not resolve total from path "${totalPath}" — got ${JSON.stringify(resolvedTotal)}. ` +
      `Will paginate until an empty page is returned.`,
    );
  }

  // Pre-scan already estimated pages for this URL. If the actual total differs,
  // adjust pageProgress.total to stay accurate.
  const totalPagesForUrl = Math.min(Math.ceil(totalItems / pageSize), maxPages);
  // Reconcile: if totalItems > 0, pre-scan would have estimated the same
  // totalPagesForUrl. If totalItems is 0 (unknown), pre-scan estimated 1.
  // Ensure the total accounts for the actual page count.
  if (totalItems > 0) {
    // Pre-scan estimated totalPagesForUrl; if it differs, adjust
    const neededTotal = pageProgress.completed + totalPagesForUrl;
    if (neededTotal > pageProgress.total) {
      pageProgress.total = neededTotal;
    }
  }
  pageProgress.completed += 1; // first page done
  updateProgress({
    currentPage: pageProgress.completed,
    totalPages: pageProgress.total,
    totalProducts: result.totalProducts,
    newDeals: result.newDeals,
    uniqueProducts: getUniqueProductCount(),
  });
  result.totalProducts += firstVariants.variants.length;

  // Debug: log discount distribution from first page
  const discountBuckets = { zero: 0, low: 0, mid: 0, high: 0, outOfStock: 0 };
  for (const v of firstVariants.variants) {
    if (!v.inStock) { discountBuckets.outOfStock++; continue; }
    if (v.discountPercentage === 0) discountBuckets.zero++;
    else if (v.discountPercentage < 10) discountBuckets.low++;
    else if (v.discountPercentage < 30) discountBuckets.mid++;
    else discountBuckets.high++;
  }
  console.log(
    `[scraper] First page discount distribution (${firstVariants.variants.length} variants): ` +
    `0%=${discountBuckets.zero}, 1-9%=${discountBuckets.low}, 10-29%=${discountBuckets.mid}, ` +
    `30%+=${discountBuckets.high}, outOfStock=${discountBuckets.outOfStock}`,
  );

  for (const variant of pickBestVariantPerProduct(firstVariants.variants)) {
    if (seenIds) {
      if (seenIds.has(variant.productId)) continue;
      seenIds.add(variant.productId);
    }
    await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady, websiteName);
  }

  // --- Determine pagination strategy ---
  // When totalItems is known, pre-build the offset list (existing fast path).
  // When totalItems is unknown (0), paginate sequentially until an empty page.

  if (totalItems > 0 && totalItems <= pageSize) {
    console.log(`[scraper] API pagination: ${totalItems} total items fit in 1 page`);
    return;
  }

  if (totalItems > 0) {
    // --- Known total: build remaining offset list ---
    const totalPages = Math.min(Math.ceil(totalItems / pageSize), maxPages);
    const offsets: { offset: number; pageNum: number }[] = [];
    for (let p = 1; p < totalPages; p++) {
      offsets.push({ offset: p * pageSize, pageNum: p });
    }

    console.log(
      `[scraper] API pagination: ${totalItems} total items, ${totalPages} pages — fetching ${offsets.length} remaining pages (concurrency=${API_CONCURRENCY})`,
    );

    // --- Fetch in parallel batches ---
    let failedPages = 0;
    const batchStartTime = Date.now();
    for (let i = 0; i < offsets.length; i += API_CONCURRENCY) {
      if (isCancelled()) break;
      const batch = offsets.slice(i, i + API_CONCURRENCY);
      const batchNum = Math.floor(i / API_CONCURRENCY) + 1;
      const totalBatches = Math.ceil(offsets.length / API_CONCURRENCY);

      // Log which pages this batch is fetching
      const batchOffsets = batch.map(b => b.offset);
      const batchPageNums = batch.map(b => b.pageNum + 1); // 1-indexed for readability
      console.log(
        `[scraper] Fetching batch ${batchNum}/${totalBatches}: ` +
        `pages [${batchPageNums.join(', ')}] (offsets [${batchOffsets.join(', ')}], pageSize=${pageSize})`,
      );

      const batchResults = await Promise.all(
        batch.map(({ offset, pageNum }) =>
          fetchApiPage(schema, mergedParams, pagination, authToken, offset, pageNum)
            .then(data => ({ offset, pageNum, data })),
        ),
      );

      let batchVariantCount = 0;
      let batchNewDeals = 0;
      for (const { offset, pageNum: pn, data } of batchResults) {
        if (!data) {
          console.warn(`[scraper] ⚠ Page ${pn + 1} (offset ${offset}) failed after 3 retries`);
          errors.push({ url, message: `API pagination failed at page ${pn + 1} (offset ${offset}) after 3 retries` });
          failedPages++;
          continue;
        }

        const { variants } = parseFromApiData(data.data, schema);
        if (variants.length === 0) {
          console.warn(
            `[scraper] ⚠ Page ${pn + 1} (offset ${offset}) returned 0 variants from parseFromApiData — ` +
            `response keys: ${data.data && typeof data.data === 'object' ? Object.keys(data.data).join(', ') : typeof data.data}`,
          );
        } else if (pn < 5) {
          // Log first product ID from early pages to detect duplicate responses
          console.log(
            `[scraper] Page ${pn + 1} first variant: id="${variants[0].productId}", name="${variants[0].displayName.slice(0, 60)}"`,
          );
        }
        batchVariantCount += variants.length;
        result.totalProducts += variants.length;
        const dealsBefore = result.newDeals;
        for (const variant of pickBestVariantPerProduct(variants)) {
          if (seenIds) {
            if (seenIds.has(variant.productId)) continue;
            seenIds.add(variant.productId);
          }
          await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady, websiteName);
        }
        batchNewDeals += result.newDeals - dealsBefore;
      }

      // Small delay between batches to be respectful to the server
      if (i + API_CONCURRENCY < offsets.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Update progress after each batch
      pageProgress.completed += batch.length;
      updateProgress({
        currentPage: pageProgress.completed,
        totalPages: pageProgress.total,
        totalProducts: result.totalProducts,
        newDeals: result.newDeals,
        uniqueProducts: getUniqueProductCount(),
      });

      // Log batch result
      const elapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      const pagesCompleted = Math.min(i + API_CONCURRENCY, offsets.length) + 1;
      console.log(
        `[scraper] Batch ${batchNum}/${totalBatches} done: ` +
        `${batchVariantCount} variants, ${batchNewDeals} new deals | ` +
        `running total: ${pagesCompleted}/${totalPages} pages, ${result.totalProducts} products, ` +
        `${result.newDeals} new deals, ${elapsed}s elapsed`,
      );
    }

    console.log(
      `[scraper] API pagination complete: ${totalPages - failedPages}/${totalPages} pages fetched for ${url}` +
      (failedPages > 0 ? ` (${failedPages} failed)` : '') +
      ` | totalItems reported by API: ${totalItems}, actual products scraped so far: ${result.totalProducts}`,
    );
  } else {
    // --- Unknown total: paginate sequentially until empty ---
    console.log(
      `[scraper] API pagination: total unknown — fetching pages sequentially until empty (max ${maxPages} pages)`,
    );

    let pageNum = 1;
    let pagesCompleted = 1; // first page already done
    const batchStartTime = Date.now();

    while (pageNum < maxPages) {
      if (isCancelled()) break;
      const offset = pageNum * pageSize;
      console.log(
        `[scraper] Fetching page ${pageNum + 1} (offset ${offset}, pageSize=${pageSize})`,
      );
      const pageResult = await fetchApiPage(schema, mergedParams, pagination, authToken, offset, pageNum);

      if (!pageResult) {
        console.warn(`[scraper] ⚠ Page ${pageNum + 1} (offset ${offset}) failed — stopping pagination`);
        errors.push({ url, message: `API pagination failed at offset ${offset} after 3 retries` });
        break;
      }

      const { variants } = parseFromApiData(pageResult.data, schema);
      if (variants.length === 0) {
        console.log(`[scraper] API pagination: page ${pageNum + 1} returned 0 variants — stopping`);
        break;
      }

      result.totalProducts += variants.length;
      for (const variant of pickBestVariantPerProduct(variants)) {
        if (seenIds) {
          if (seenIds.has(variant.productId)) continue;
          seenIds.add(variant.productId);
        }
        await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady, websiteName);
      }

      pagesCompleted++;
      pageProgress.completed += 1;
      pageProgress.total = Math.max(pageProgress.total, pageProgress.completed + 1); // keep total ahead
      updateProgress({
        currentPage: pageProgress.completed,
        totalPages: pageProgress.total,
        totalProducts: result.totalProducts,
        newDeals: result.newDeals,
        uniqueProducts: getUniqueProductCount(),
      });

      if (pagesCompleted % 50 === 0) {
        const elapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1);
        console.log(
          `[scraper] API progress: ${pagesCompleted} pages fetched (latest offset ${offset}), ` +
          `${result.totalProducts} products, ${result.newDeals} new deals, ${elapsed}s elapsed`,
        );
      }

      // Small delay between pages
      await new Promise(resolve => setTimeout(resolve, 200));
      pageNum++;
    }

    console.log(
      `[scraper] API pagination complete (sequential): ${pagesCompleted} pages fetched for ${url}`,
    );

    // Pre-scan estimated 1 page for unknown-total URLs. Now that we know the
    // actual count, correct the total (pagesCompleted - 1 extra pages beyond
    // the 1 already estimated).
    pageProgress.total += (pagesCompleted - 1);
  }
}

/** Simple dot-path resolver for extracting values like 'total' or 'data.total' from API responses */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDotPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Internal: evaluate a variant against filters and persist if matched
// ---------------------------------------------------------------------------

// Debug counter for filter misses (reset per scrape job)
let _debugFilterMissCount = 0;

/** Number of webhook deals to accumulate before flushing mid-scrape */
const WEBHOOK_BATCH_SIZE = 10;

/** Threshold above which we verify the price on the product detail page */
const VERIFY_DISCOUNT_THRESHOLD = 90;

async function evaluateAndPersist(
  variant: ProductVariant,
  activeFilters: FilterWithId[],
  ttlDays: number,
  result: { totalProducts: number; newDeals: number },
  baseUrl?: string,
  webhookDeals?: DealPayload[],
  onBatchReady?: () => Promise<void>,
  websiteName?: string,
  verifyOptions?: { httpConfig: HttpClientConfig; fetchHeaders?: Record<string, string> },
): Promise<void> {
  const matchingFilters = findMatchingFilters(variant, activeFilters);
  if (matchingFilters.length === 0) {
    // Debug: log first few filter misses with non-zero discount
    if (variant.discountPercentage > 0 && _debugFilterMissCount < 5) {
      _debugFilterMissCount++;
      console.log(
        `[scraper] Filter miss: "${variant.displayName}" discount=${variant.discountPercentage}%, ` +
        `bestPrice=${variant.bestPrice}, categories=[${variant.categories.join(', ')}]`,
      );
    }
    return;
  }

  const matchedFilter = matchingFilters[0] as FilterWithId;

  // Use productId as the seen key so the whole product is deduped, not individual SKUs
  const isNew = await isNewDeal(variant.productId);
  if (!isNew) return;

  console.log(
    `[scraper] ✓ New deal: "${variant.displayName}" discount=${variant.discountPercentage}%, ` +
    `bestPrice=$${variant.bestPrice}, filter=${matchedFilter.id}`,
  );

  // --- Price verification on product detail page for extreme discounts ---
  let priceVerification: 'verified' | 'mismatch' | 'unverified' = 'unverified';
  let pdpPrice: number | undefined;

  const fullProductUrl = resolveFullUrl(variant.productUrl, baseUrl);
  if (
    variant.discountPercentage >= VERIFY_DISCOUNT_THRESHOLD &&
    fullProductUrl.startsWith('http') &&
    verifyOptions
  ) {
    try {
      console.log(
        `[scraper] 🔍 Verifying price for "${variant.displayName}" ` +
        `(${variant.discountPercentage}% off, $${variant.bestPrice}) — ${fullProductUrl}`,
      );
      const pdpResponse = await fetchWithRetry(
        fullProductUrl,
        verifyOptions.httpConfig,
        verifyOptions.fetchHeaders ? { headers: verifyOptions.fetchHeaders } : undefined,
      );
      if (pdpResponse) {
        const pdpHtml = await pdpResponse.text();

        // Strategy 1: hidden input with finalPrice (NEX-specific)
        const finalPriceMatch = /finalPrice[^"]*"\s*value="([\d.]+)"/i.exec(pdpHtml);
        // Strategy 2: meta tag product:price:amount
        const metaPriceMatch = /property="product:price:amount"\s*content="([\d.]+)"/i.exec(pdpHtml)
          ?? /content="([\d.]+)"\s*property="product:price:amount"/i.exec(pdpHtml);
        // Strategy 3: JSON-LD price
        const jsonLdMatch = /"price"\s*:\s*"?([\d.]+)"?/i.exec(pdpHtml);

        const candidates = [
          finalPriceMatch?.[1],
          metaPriceMatch?.[1],
          jsonLdMatch?.[1],
        ].filter(Boolean).map(Number).filter(n => n > 0);

        if (candidates.length > 0) {
          pdpPrice = candidates[0];
          const diff = Math.abs(pdpPrice - variant.bestPrice);
          if (diff <= 0.01) {
            priceVerification = 'verified';
            console.log(
              `[scraper] ✅ Price verified: PDP confirms $${pdpPrice.toFixed(2)} ` +
              `(matches bestPrice $${variant.bestPrice.toFixed(2)})`,
            );
          } else {
            priceVerification = 'mismatch';
            console.warn(
              `[scraper] ⚠️ Price mismatch: PDP shows $${pdpPrice.toFixed(2)} ` +
              `but listing says $${variant.bestPrice.toFixed(2)}`,
            );
          }
        } else {
          console.warn(`[scraper] Could not extract price from PDP (${pdpHtml.length} chars)`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scraper] Price verification failed: ${msg}`);
    }
  }

  const [deal] = await db
    .insert(deals)
    .values({
      productId: variant.productId,
      skuId: variant.skuId,
      productName: variant.displayName,
      brand: variant.brand,
      listPrice: variant.listPrice.toFixed(2),
      bestPrice: variant.bestPrice.toFixed(2),
      discountPercentage: variant.discountPercentage.toFixed(2),
      imageUrl: variant.imageUrl ? resolveFullUrl(variant.imageUrl, baseUrl) : null,
      productUrl: resolveFullUrl(variant.productUrl, baseUrl),
      websiteName: websiteName ?? null,
      filterId: matchedFilter.id,
    })
    .returning();

  await markAsSeen(variant.productId, ttlDays);
  await createNotification(deal.id);
  result.newDeals++;

  // Collect for webhook dispatch
  if (webhookDeals) {
    webhookDeals.push({
      productName: variant.displayName,
      brand: variant.brand,
      listPrice: `$${variant.listPrice.toFixed(2)}`,
      bestPrice: `$${variant.bestPrice.toFixed(2)}`,
      discountPercentage: variant.discountPercentage.toFixed(2),
      imageUrl: variant.imageUrl ? resolveFullUrl(variant.imageUrl, baseUrl) : null,
      productUrl: resolveFullUrl(variant.productUrl, baseUrl),
      websiteName,
      priceVerification,
      pdpPrice: pdpPrice !== undefined ? `$${pdpPrice.toFixed(2)}` : undefined,
    });

    if (onBatchReady && webhookDeals.length >= WEBHOOK_BATCH_SIZE) {
      await onBatchReady();
    }
  }
}

// ---------------------------------------------------------------------------
// Public: execute a full scrape job
// ---------------------------------------------------------------------------

/**
 * Execute a complete scrape job:
 * 1. Clean expired seen items
 * 2. Fetch all active websites and their product page URLs
 * 3. Fetch all active filters
 * 4. For each URL: fetch, parse, evaluate variants, persist new deals, notify
 * 5. Log summary and return results
 */
// ---------------------------------------------------------------------------
// Pre-scan: estimate total page count for a single URL without full scraping.
// Used to set an accurate progress denominator before the main scrape loop.
// ---------------------------------------------------------------------------

async function estimateUrlPageCount(
  url: string,
  customSchema?: ProductPageSchema,
  authToken?: string,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<number> {
  try {
    if (customSchema) {
      if (customSchema.extraction.method === 'api-json' && customSchema.extraction.apiUrl) {
        const pagination = customSchema.extraction.pagination;
        if (!pagination) return 1; // single-page API, no pagination

        const pageSize = pagination.pageSize ?? 120;
        const totalPath = pagination.totalPath ?? 'total';

        // Merge query params from the URL into the schema's static params
        const mergedParams: Record<string, string> = { ...customSchema.extraction.apiParams };
        try {
          const pageUrl = new URL(url);
          pageUrl.searchParams.forEach((value, key) => {
            mergedParams[key] = value;
          });
        } catch { /* URL parse failed — use schema defaults */ }

        // Make a lightweight first-page API call to read the total
        const probeResult = await fetchApiPage(customSchema, mergedParams, pagination, authToken, 0, 0);
        if (!probeResult?.data) return 1;

        const resolvedTotal = resolveDotPath(probeResult.data, totalPath);
        if (typeof resolvedTotal === 'number' && resolvedTotal > 0) {
          const pages = Math.min(Math.ceil(resolvedTotal / pageSize), maxPages);
          console.log(`[scraper] Pre-scan ${url}: API reports ${resolvedTotal} items → ${pages} pages`);
          return pages;
        }

        // Unknown total — use a conservative estimate; the actual scrape will
        // adjust pageProgress.total as it discovers pages.
        console.log(`[scraper] Pre-scan ${url}: API total unknown, estimating 1 page (will adjust during scrape)`);
        return 1;
      }

      // html-dom with pagination
      if (customSchema.extraction.method === 'html-dom' && customSchema.extraction.htmlPagination) {
        const htmlPag = customSchema.extraction.htmlPagination;
        const pages = Math.min(htmlPag.maxPages ?? 50, maxPages);
        console.log(`[scraper] Pre-scan ${url}: html-dom pagination, maxPages=${pages}`);
        return pages;
      }

      // Custom schema but no pagination — single page
      return 1;
    }

    // Default __NEXT_DATA__ parser — fetch page 1 to read page count
    const response = await fetchWithRetry(url, {
      ...DEFAULT_HTTP_CONFIG,
      timeout: 8000,
      maxRetries: 1,
    });
    if (!response) return 1;

    const html = await response.text();
    const payload = parseNextData(html);
    if (!payload) return 1;

    if (isListingPage(payload)) {
      const pages = Math.min(getPageCount(payload), maxPages);
      console.log(`[scraper] Pre-scan ${url}: __NEXT_DATA__ listing with ${pages} pages`);
      return pages;
    }

    return 1;
  } catch (err) {
    console.warn(`[scraper] Pre-scan failed for ${url}: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
}

export async function executeScrapeJob(
  httpConfig: HttpClientConfig = DEFAULT_HTTP_CONFIG,
  maxPages: number = DEFAULT_MAX_PAGES,
  ttlDays: number = DEFAULT_TTL_DAYS,
  websiteId?: string,
  filterId?: string,
  jobId?: string,
): Promise<ScrapeResult> {
  // Set the module-level job ID so all internal helpers use it
  _currentJobId = jobId || '';
  const startTime = Date.now();
  const errors: ScrapeError[] = [];
  const counters = { totalProducts: 0, newDeals: 0 };
  const pageProgress = { completed: 0, total: 0 };

  resetProgress();

  // Reset debug counters
  _debugFilterMissCount = 0;
  resetDebugSampleCount();

  // Step 1: Clean expired seen items
  const cleaned = await cleanExpiredItems();
  if (cleaned > 0) {
    console.log(`[scraper] Cleaned ${cleaned} expired seen items`);
  }

  // Step 2: Fetch active websites (optionally filtered to a single website)
  let websites;
  if (websiteId) {
    websites = await db
      .select()
      .from(monitoredWebsites)
      .where(and(eq(monitoredWebsites.active, true), eq(monitoredWebsites.id, websiteId)));
  } else {
    websites = await db
      .select()
      .from(monitoredWebsites)
      .where(eq(monitoredWebsites.active, true));
  }

  if (websites.length === 0) {
    console.log(`[scraper] No active websites found${websiteId ? ` for id ${websiteId}` : ''} — skipping`);
    return {
      totalProductsEncountered: 0,
      newDealsFound: 0,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  // Step 3: Fetch active filters (optionally filtered to a single filter)
  let filterRows;
  if (filterId) {
    filterRows = await db
      .select()
      .from(filters)
      .where(and(eq(filters.active, true), eq(filters.id, filterId)));
  } else {
    filterRows = await db
      .select()
      .from(filters)
      .where(eq(filters.active, true));
  }

  const activeFilters = filterRows.map(toFilterWithId);

  if (activeFilters.length === 0) {
    console.log('[scraper] No active filters configured — skipping');
    return {
      totalProductsEncountered: 0,
      newDealsFound: 0,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  // Debug: log active filter criteria
  for (const f of activeFilters) {
    console.log(
      `[scraper] Active filter "${f.id}": discount>=${f.discountThreshold}%, ` +
      `maxPrice=${f.maxPrice ?? 'none'}, keywords=[${(f.keywords ?? []).join(', ')}], ` +
      `excludedCategories=[${(f.excludedCategories ?? []).join(', ')}]`,
    );
  }

  // Step 4: Pre-scan — estimate total pages across all URLs before scraping
  // This gives us an accurate progress denominator from the start.
  interface WebsiteContext {
    website: typeof websites[number];
    customSchema?: ProductPageSchema;
    schemaError?: string;
    authToken?: string;
    urls: { id: string; url: string; websiteId: string }[];
  }
  const websiteContexts: WebsiteContext[] = [];

  for (const website of websites) {
    let customSchema: ProductPageSchema | undefined;
    let schemaError: string | undefined;
    if (website.productSchema) {
      const schemaResult = parseSchemaJson(website.productSchema);
      if (schemaResult.valid) {
        customSchema = schemaResult.schema;
      } else {
        schemaError = schemaResult.error;
        console.error(`[scraper] Schema error for "${website.name}": ${schemaResult.error}`);
        errors.push({
          url: website.baseUrl,
          message: `Schema configuration error for "${website.name}": ${schemaResult.error}. Fix the schema in the website settings.`,
        });
      }
    }

    let authToken: string | undefined;
    if (website.authToken) {
      try { authToken = decrypt(website.authToken); } catch { /* skip */ }
    }

    const urls = await db
      .select()
      .from(productPageUrls)
      .where(eq(productPageUrls.websiteId, website.id));

    websiteContexts.push({ website, customSchema, schemaError, authToken, urls: urls as { id: string; url: string; websiteId: string }[] });
  }

  // Estimate total pages for each URL
  let estimatedTotalPages = 0;
  for (const ctx of websiteContexts) {
    for (const urlRow of ctx.urls) {
      const estimated = await estimateUrlPageCount(
        urlRow.url, ctx.customSchema, ctx.authToken, maxPages,
      );
      estimatedTotalPages += estimated;
    }
  }

  pageProgress.total = estimatedTotalPages;
  console.log(`[scraper] Pre-scan complete: estimated ${estimatedTotalPages} total pages across ${websiteContexts.reduce((n, c) => n + c.urls.length, 0)} URLs`);
  updateProgress({ totalPages: pageProgress.total });

  // Step 5: Process each website's URLs
  for (const { website, customSchema, schemaError, authToken, urls } of websiteContexts) {
    // Check for cancellation
    if (isCancelled()) {
      console.log('[scraper] Job cancelled by user');
      break;
    }

    // Skip websites with broken schemas — error already recorded above
    if (schemaError && website.productSchema) {
      console.log(`[scraper] Skipping "${website.name}" due to schema error: ${schemaError}`);
      continue;
    }

    // Track seen compositeIds within this website to deduplicate across URLs
    const seenIds = new Set<string>();
    const webhookDeals: DealPayload[] = [];
    const urlDiagnostics = new Map<string, string>();

    // Flush accumulated webhook deals — called automatically by evaluateAndPersist
    // when the batch bucket reaches WEBHOOK_BATCH_SIZE, and once more at the end
    // of each website to drain any remaining deals.
    async function flushWebhookBatch() {
      if (webhookDeals.length === 0) return;
      const batch = webhookDeals.splice(0, webhookDeals.length);
      try {
        await dispatchWebhooks(website.id, batch);
      } catch (err) {
        console.error(`[scraper] Webhook batch dispatch failed for ${website.name}: ${err instanceof Error ? err.message : err}`);
      }
    }

    for (const urlRow of urls) {
      // Check for cancellation
      if (isCancelled()) {
        console.log('[scraper] Job cancelled by user');
        break;
      }
      const before = counters.totalProducts;
      try {
        // Resolve effective filters for this URL (URL-level > website-level > all)
        const effectiveFilters = await resolveFiltersForUrl(urlRow.id, website.id, activeFilters);
        if (effectiveFilters.length === 0) {
          console.log(`[scraper] Skipping URL ${urlRow.url} — no active filters apply`);
          pageProgress.completed += 1;
          updateProgress({ currentPage: pageProgress.completed, totalPages: pageProgress.total });
          continue;
        }

        updateProgress({ currentWebsite: website.name });
        await processUrl(
          urlRow.url,
          effectiveFilters,
          httpConfig,
          maxPages,
          ttlDays,
          counters,
          errors,
          pageProgress,
          customSchema,
          authToken,
          seenIds,
          website.baseUrl,
          webhookDeals,
          flushWebhookBatch,
          website.name,
          urlDiagnostics,
        );

        // Check if this URL produced any errors during processUrl
        const urlError = errors.find((e) => e.url === urlRow.url);
        const productsFromUrl = counters.totalProducts - before;
        const urlDiag = urlDiagnostics.get(urlRow.url);

        // Determine status: error > warning (0 products with diagnostic) > ok
        let status: string;
        let errorMsg: string | null;
        if (urlError) {
          status = 'error';
          errorMsg = urlError.message;
        } else if (productsFromUrl === 0 && urlDiag) {
          status = 'warning';
          errorMsg = urlDiag;
        } else if (productsFromUrl === 0) {
          status = 'warning';
          errorMsg = 'Scrape completed but found 0 products. The schema may not match the page structure.';
        } else {
          status = 'ok';
          errorMsg = null;
        }

        await db
          .update(productPageUrls)
          .set({
            lastScrapeStatus: status,
            lastScrapeError: errorMsg,
            lastScrapeCount: productsFromUrl,
            lastScrapedAt: new Date(),
          })
          .where(eq(productPageUrls.id, urlRow.id));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[scraper] Error processing ${urlRow.url}: ${message}`);
        errors.push({ url: urlRow.url, message });

        await db
          .update(productPageUrls)
          .set({
            lastScrapeStatus: 'error',
            lastScrapeError: message,
            lastScrapeCount: 0,
            lastScrapedAt: new Date(),
          })
          .where(eq(productPageUrls.id, urlRow.id));
      }
    }

    // Flush any remaining deals that didn't fill a complete batch
    await flushWebhookBatch();
  }

  // Step 6: Log summary
  const durationMs = Date.now() - startTime;
  const wasCancelled = isCancelled();
  console.log(
    `[scraper] Job ${wasCancelled ? 'cancelled' : 'complete'} — ${counters.totalProducts} products encountered, ` +
    `${counters.newDeals} new deals found, ${durationMs}ms elapsed, ` +
    `${errors.length} error(s)`,
  );

  if (!wasCancelled) {
    completeProgress(counters.totalProducts, counters.newDeals);
  }
  // If cancelled, status is already 'cancelled' — leave it as-is

  // Step 7: Record scrape run history
  try {
    const status = wasCancelled ? 'cancelled' : errors.length > 0 ? 'error' : 'completed';
    const websiteNames = websites.map(w => w.name).join(', ');
    await db.insert(scrapeRuns).values({
      websiteId: websites.length === 1 ? websites[0].id : null,
      websiteName: websiteNames || 'Unknown',
      status,
      source: jobId ? (getJobSource(jobId) ?? null) : null,
      totalProducts: counters.totalProducts,
      newDeals: counters.newDeals,
      errorCount: errors.length,
      durationMs,
      errorMessage: errors.length > 0 ? errors.map(e => e.message).join('; ').slice(0, 2000) : null,
      startedAt: new Date(startTime),
      completedAt: new Date(),
    });
  } catch (err) {
    console.error(`[scraper] Failed to record scrape run: ${err instanceof Error ? err.message : err}`);
  }

  return {
    totalProductsEncountered: counters.totalProducts,
    newDealsFound: counters.newDeals,
    durationMs,
    errors,
  };
}
