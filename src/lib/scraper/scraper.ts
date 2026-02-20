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
import { parseWithSchema, parseFromApiData, parseSchemaJson, type ProductPageSchema } from './schema-parser';
import { findMatchingFilters, type FilterCriteria } from '@/lib/filter-engine';
import { isNewDeal, markAsSeen, cleanExpiredItems } from '@/lib/seen-tracker';
import { createNotification } from '@/lib/notification-service';
import { dispatchWebhooks, type DealPayload } from '@/lib/webhook-service';
import { decrypt } from '@/lib/crypto';

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

const DEFAULT_MAX_PAGES = Infinity;
const DEFAULT_TTL_DAYS = 7;

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
  excludedCategories: string[] | null;
}): FilterWithId {
  return {
    id: row.id,
    discountThreshold: row.discountThreshold,
    maxPrice: row.maxPrice !== null ? Number(row.maxPrice) : null,
    keywords: row.keywords ?? [],
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
  customSchema?: ProductPageSchema,
  authToken?: string,
  seenIds?: Set<string>,
  baseUrl?: string,
  webhookDeals?: DealPayload[],
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

      const apiResult = await fetchApiJson(customSchema.extraction.apiUrl, {
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
      for (const variant of variants) {
        if (!variant.inStock) continue;
        if (seenIds) {
          if (seenIds.has(variant.compositeId)) continue;
          seenIds.add(variant.compositeId);
        }
        await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals);
      }
      return;
    }
  }

  // Fetch the page HTML (needed for HTML-based schemas and default parser)
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
    for (const variant of variants) {
      if (!variant.inStock) continue;
      if (seenIds) {
        if (seenIds.has(variant.compositeId)) continue;
        seenIds.add(variant.compositeId);
      }
      await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals);
    }
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

    for (let page = 2; page <= pageCount; page++) {
      const separator = url.includes('?') ? '&' : '?';
      const pagedUrl = `${url}${separator}page=${page}`;

      const pageResponse = await fetchWithRetry(pagedUrl, httpConfig);
      if (!pageResponse) {
        errors.push({ url: pagedUrl, message: 'Failed to fetch pagination page' });
        continue;
      }

      const pageHtml = await pageResponse.text();
      const pagePayload = parseNextData(pageHtml);
      if (!pagePayload) {
        errors.push({ url: pagedUrl, message: 'Could not parse __NEXT_DATA__ from pagination page' });
        continue;
      }

      allVariants.push(...extractProductVariants(pagePayload));
    }
  }

  result.totalProducts += allVariants.length;

  // Evaluate each in-stock variant against filters
  for (const variant of allVariants) {
    if (!variant.inStock) continue;
    if (seenIds) {
      if (seenIds.has(variant.compositeId)) continue;
      seenIds.add(variant.compositeId);
    }
    await evaluateAndPersist(variant, activeFilters, ttlDays, result, baseUrl, webhookDeals);
  }
}

async function evaluateAndPersist(
  variant: ProductVariant,
  activeFilters: FilterWithId[],
  ttlDays: number,
  result: { totalProducts: number; newDeals: number },
  baseUrl?: string,
  webhookDeals?: DealPayload[],
): Promise<void> {
  const matchingFilters = findMatchingFilters(variant, activeFilters);
  if (matchingFilters.length === 0) return;

  const matchedFilter = matchingFilters[0] as FilterWithId;

  const isNew = await isNewDeal(variant.compositeId);
  if (!isNew) return;

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

  await markAsSeen(variant.compositeId, ttlDays);
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

  // Step 4: Process each website's URLs
  for (const website of websites) {
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

    for (const urlRow of urls) {
      const before = counters.totalProducts;
      try {
        await processUrl(
          urlRow.url,
          activeFilters,
          httpConfig,
          maxPages,
          ttlDays,
          counters,
          errors,
          customSchema,
          authToken,
          seenIds,
          website.baseUrl,
          webhookDeals,
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

    // Dispatch webhooks for this website's new deals
    try {
      await dispatchWebhooks(website.id, webhookDeals);
    } catch (err) {
      console.error(`[scraper] Webhook dispatch failed for ${website.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Step 5: Log summary
  const durationMs = Date.now() - startTime;
  console.log(
    `[scraper] Job complete — ${counters.totalProducts} products encountered, ` +
    `${counters.newDeals} new deals found, ${durationMs}ms elapsed, ` +
    `${errors.length} error(s)`,
  );

  return {
    totalProductsEncountered: counters.totalProducts,
    newDealsFound: counters.newDeals,
    durationMs,
    errors,
  };
}
