/**
 * Scrape job orchestrator.
 *
 * Fetches all active monitored websites and their product page URLs,
 * parses product data, evaluates variants against active filters,
 * tracks seen items to avoid duplicates, and creates notifications
 * for new deals.
 */

import { db } from '@/db';
import { deals, filters, monitoredWebsites, productPageUrls } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

import { fetchWithRetry, fetchApiJson, type HttpClientConfig } from './http-client';
import {
  parseNextData,
  extractProductVariants,
  isListingPage,
  getPageCount,
  type ProductVariant,
} from './parser';
import { parseWithSchema, parseFromApiData, parseSchemaJson, resetDebugSampleCount, type ProductPageSchema, type ApiPaginationConfig } from './schema-parser';
import { findMatchingFilters, type FilterCriteria } from '@/lib/filter-engine';
import { isNewDeal, markAsSeen, cleanExpiredItems } from '@/lib/seen-tracker';
import { createNotification } from '@/lib/notification-service';
import { dispatchWebhooks, type DealPayload } from '@/lib/webhook-service';
import { decrypt } from '@/lib/crypto';
import { resetProgress, updateProgress, completeProgress, failProgress, trackUniqueProduct, getUniqueProductCount, isCancelled } from '@/lib/scrape-progress';

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
          url, maxPages, activeFilters, ttlDays, result, errors, pageProgress, seenIds, baseUrl, webhookDeals, onBatchReady,
        );
      } else {
        // Single-page API fetch (no pagination)
        pageProgress.total += 1;
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

        const { variants } = parseFromApiData(apiResult.data, customSchema);
        result.totalProducts += variants.length;
        const bestVariants = pickBestVariantPerProduct(variants);
        for (const variant of bestVariants) {
          if (seenIds) {
            if (seenIds.has(variant.productId)) continue;
            seenIds.add(variant.productId);
          }
          await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady);
        }
        pageProgress.completed += 1;
        updateProgress({ currentPage: pageProgress.completed, totalPages: pageProgress.total, totalProducts: result.totalProducts, newDeals: result.newDeals, uniqueProducts: getUniqueProductCount() });
      }
      return;
    }
  }

  // Fetch the page HTML (needed for HTML-based schemas and default parser)
  pageProgress.total += 1;
  const response = await fetchWithRetry(url, httpConfig);
  if (!response) {
    errors.push({ url, message: 'Failed to fetch (retries exhausted or unreachable)' });
    return;
  }
  const html = await response.text();

  if (customSchema) {
    // HTML-based custom schema
    const { variants } = parseWithSchema(html, customSchema);
    result.totalProducts += variants.length;
    const bestVariants = pickBestVariantPerProduct(variants);
    for (const variant of bestVariants) {
      if (seenIds) {
        if (seenIds.has(variant.productId)) continue;
        seenIds.add(variant.productId);
      }
      await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady);
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
    pageProgress.total += pageCount - 1; // add extra pages to total

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
    await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady);
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

  // Apply merged params first (URL query params + schema apiParams)
  for (const [key, value] of Object.entries(mergedParams)) {
    body[key] = value;
  }

  // Build query params for pagination if needed
  const queryParams: Record<string, string> = {};

  if (paginationIn === 'query') {
    // Send pagination as URL query parameters
    if (pagination.cursorTemplate) {
      queryParams[offsetParam] = pagination.cursorTemplate.replace('{offset}', String(paginationValue));
    } else {
      queryParams[offsetParam] = String(paginationValue);
    }
    if (!pagination.cursorTemplate) {
      queryParams[limitParam] = String(pageSize);
    }
    // Remove pagination keys from body so they don't get sent as ignored params
    delete body[offsetParam];
    delete body[limitParam];
  } else {
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
  if (typeof resolvedTotal === 'number' && resolvedTotal > 0) {
    totalItems = resolvedTotal;
  } else {
    console.warn(
      `[scraper] Could not resolve total from path "${totalPath}" — got ${JSON.stringify(resolvedTotal)}. ` +
      `Will paginate until an empty page is returned.`,
    );
  }

  // Update progress with total page count for this URL
  const totalPagesForUrl = Math.min(Math.ceil(totalItems / pageSize), maxPages);
  pageProgress.total += totalPagesForUrl;
  pageProgress.completed += 1; // first page done
  updateProgress({
    currentPage: pageProgress.completed,
    totalPages: pageProgress.total,
    totalProducts: result.totalProducts,
    newDeals: result.newDeals,
    uniqueProducts: getUniqueProductCount(),
  });

  // Process first page results
  const firstVariants = parseFromApiData(firstResult.data, schema);
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
    await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady);
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
          await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady);
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
      (failedPages > 0 ? ` (${failedPages} failed)` : ''),
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
        await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals, onBatchReady);
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

async function evaluateAndPersist(
  variant: ProductVariant,
  activeFilters: FilterWithId[],
  ttlDays: number,
  result: { totalProducts: number; newDeals: number },
  baseUrl?: string,
  webhookDeals?: DealPayload[],
  onBatchReady?: () => Promise<void>,
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
      imageUrl: variant.imageUrl,
      productUrl: resolveFullUrl(variant.productUrl, baseUrl),
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
      listPrice: variant.listPrice.toFixed(2),
      bestPrice: variant.bestPrice.toFixed(2),
      discountPercentage: variant.discountPercentage.toFixed(2),
      imageUrl: variant.imageUrl,
      productUrl: resolveFullUrl(variant.productUrl, baseUrl),
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
export async function executeScrapeJob(
  httpConfig: HttpClientConfig = DEFAULT_HTTP_CONFIG,
  maxPages: number = DEFAULT_MAX_PAGES,
  ttlDays: number = DEFAULT_TTL_DAYS,
  websiteId?: string,
): Promise<ScrapeResult> {
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

  // Step 3: Fetch active filters
  const filterRows = await db
    .select()
    .from(filters)
    .where(eq(filters.active, true));

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

  // Step 4: Process each website's URLs
  for (const website of websites) {
    // Check for cancellation
    if (isCancelled()) {
      console.log('[scraper] Job cancelled by user');
      break;
    }
    // Parse custom schema if available
    let customSchema: ProductPageSchema | undefined;
    if (website.productSchema) {
      const schemaResult = parseSchemaJson(website.productSchema);
      if (schemaResult.valid) {
        customSchema = schemaResult.schema;
      }
    }

    // Decrypt auth token if stored
    let authToken: string | undefined;
    if (website.authToken) {
      try { authToken = decrypt(website.authToken); } catch { /* skip */ }
    }

    const urls = await db
      .select()
      .from(productPageUrls)
      .where(eq(productPageUrls.websiteId, website.id));

    // Track seen compositeIds within this website to deduplicate across URLs
    const seenIds = new Set<string>();
    const webhookDeals: DealPayload[] = [];

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
        updateProgress({ currentWebsite: website.name });
        await processUrl(
          urlRow.url,
          activeFilters,
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
        );

        // Check if this URL produced any errors during processUrl
        const urlError = errors.find((e) => e.url === urlRow.url);
        const productsFromUrl = counters.totalProducts - before;

        await db
          .update(productPageUrls)
          .set({
            lastScrapeStatus: urlError ? 'error' : 'ok',
            lastScrapeError: urlError?.message ?? null,
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

  // Step 5: Log summary
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

  return {
    totalProductsEncountered: counters.totalProducts,
    newDealsFound: counters.newDeals,
    durationMs,
    errors,
  };
}
