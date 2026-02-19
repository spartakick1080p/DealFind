import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { validateScrapeUrl } from '@/lib/scraper/validate-url';
import { fetchWithRetry, fetchApiJson, type HttpClientConfig } from '@/lib/scraper/http-client';
import {
  parseNextData,
  extractProductVariants,
  isListingPage,
} from '@/lib/scraper/parser';
import { parseWithSchema, parseFromApiData, parseSchemaJson } from '@/lib/scraper/schema-parser';
import { db } from '@/db';
import { monitoredWebsites } from '@/db/schema';
import { decrypt } from '@/lib/crypto';

const DEFAULT_CONFIG: HttpClientConfig = {
  rateLimit: 0,
  maxRetries: 2,
  backoffBase: 500,
  backoffMax: 5000,
  timeout: 15_000,
};

export async function POST(request: Request) {
  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { url, websiteId } = (typeof body === 'object' && body !== null
    ? body
    : {}) as { url?: unknown; websiteId?: unknown };

  if (typeof url !== 'string') {
    return NextResponse.json(
      { error: 'Missing or invalid "url" field' },
      { status: 400 },
    );
  }

  // Validate URL
  const validation = validateScrapeUrl(url);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // If a websiteId is provided, try to use its custom schema
  if (typeof websiteId === 'string' && websiteId) {
    try {
      const [website] = await db
        .select()
        .from(monitoredWebsites)
        .where(eq(monitoredWebsites.id, websiteId));

      if (website?.productSchema) {
        const schemaResult = parseSchemaJson(website.productSchema);
        if (schemaResult.valid) {
          const { schema } = schemaResult;

          // api-json: fetch from API directly instead of scraping HTML
          if (schema.extraction.method === 'api-json' && schema.extraction.apiUrl) {
            // Decrypt auth token if stored
            let authToken: string | undefined;
            if (website.authToken) {
              try { authToken = decrypt(website.authToken); } catch { /* no token */ }
            }

            const apiResult = await fetchApiJson(schema.extraction.apiUrl, {
              method: schema.extraction.apiMethod,
              params: schema.extraction.apiParams,
              headers: schema.extraction.apiHeaders,
              body: schema.extraction.apiBody,
              authToken,
            });

            if (!apiResult) {
              return NextResponse.json(
                { error: 'API request failed — could not fetch data from the configured API endpoint' },
                { status: 502 },
              );
            }

            const { variants, pageType } = parseFromApiData(apiResult.data, schema);
            // Deduplicate by compositeId
            const seen = new Set<string>();
            const uniqueVariants = variants.filter((v) => {
              if (seen.has(v.compositeId)) return false;
              seen.add(v.compositeId);
              return true;
            });
            return NextResponse.json({
              variants: uniqueVariants,
              pageType,
              count: uniqueVariants.length,
              schemaUsed: 'custom (api-json)',
              baseUrl: website.baseUrl,
            });
          }

          // HTML-based custom schema: fetch the page then parse
          const customResponse = await fetchWithRetry(validation.url, DEFAULT_CONFIG);
          if (!customResponse) {
            return NextResponse.json(
              { error: 'Failed to fetch the URL' },
              { status: 502 },
            );
          }
          const customHtml = await customResponse.text();
          const { variants, pageType } = parseWithSchema(customHtml, schema);
          const seen = new Set<string>();
          const uniqueVariants = variants.filter((v) => {
            if (seen.has(v.compositeId)) return false;
            seen.add(v.compositeId);
            return true;
          });
          return NextResponse.json({
            variants: uniqueVariants,
            pageType,
            count: uniqueVariants.length,
            schemaUsed: 'custom',
            baseUrl: website.baseUrl,
          });
        }
      }
    } catch {
      // Fall through to default parser
    }
  }

  // Default: fetch page and use the original __NEXT_DATA__ parser
  const response = await fetchWithRetry(validation.url, DEFAULT_CONFIG);
  if (!response) {
    return NextResponse.json(
      { error: 'Failed to fetch the URL' },
      { status: 502 },
    );
  }

  const html = await response.text();

  // Default: use the original __NEXT_DATA__ parser
  const payload = parseNextData(html);
  if (!payload) {
    return NextResponse.json(
      { error: 'Could not parse product data from this page. Try selecting a website with a custom schema configured.' },
      { status: 422 },
    );
  }

  const variants = extractProductVariants(payload);
  const listing = isListingPage(payload);
  const pageType = listing ? 'listing' : variants.length > 0 ? 'product' : 'unknown';

  return NextResponse.json({
    variants,
    pageType,
    count: variants.length,
    schemaUsed: 'default',
  });
}
