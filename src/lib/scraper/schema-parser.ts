/**
 * Schema-driven product parser.
 *
 * Instead of hardcoding extraction paths (like __NEXT_DATA__), this module
 * takes a user-defined ProductPageSchema that describes how to locate and
 * extract product data from arbitrary HTML. The schema is stored per-website
 * and can be edited in the app UI.
 */

import { computeDiscount, pickBestPrice } from '@/lib/discount';
import { computeCompositeId } from '@/lib/seen-tracker';
import type { ProductVariant } from './parser';

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

/**
 * Describes how to extract product data from a website's HTML.
 * Stored as JSON in the monitored_websites.product_schema column.
 */
export interface ProductPageSchema {
  /** How to extract the raw data payload from HTML */
  extraction: ExtractionConfig;
  /** JSONPath-like dot-notation paths to locate product arrays and fields */
  paths: PathConfig;
}

export interface ExtractionConfig {
  /** 'script-json' = parse JSON from a <script> tag, 'json-ld' = parse JSON-LD, 'api-json' = fetch JSON from an API, 'html-dom' = extract from HTML DOM using regex selectors */
  method: 'script-json' | 'json-ld' | 'meta-tags' | 'api-json' | 'html-dom';
  /** CSS-like selector for the script tag (e.g. 'script#__NEXT_DATA__') */
  selector?: string;
  /** For json-ld: the @type to look for (e.g. 'Product') */
  jsonLdType?: string;

  // --- api-json specific fields ---
  /** Base URL for the API endpoint */
  apiUrl?: string;
  /** HTTP method (defaults to POST) */
  apiMethod?: 'GET' | 'POST';
  /** Static query params merged into the request URL */
  apiParams?: Record<string, string>;
  /** Extra headers to send (e.g. Origin, Referer, Sec-Fetch-*) */
  apiHeaders?: Record<string, string>;
  /** JSON body template for POST requests. Use {variable} for substitution from the page URL. */
  apiBody?: Record<string, unknown>;

  // --- html-dom specific fields ---
  /** CSS-like selector for each product card container (e.g. 'div.product-card') */
  itemSelector?: string;
  /** Regex-based field extractors for html-dom method. Each key maps to a regex
   *  with a capture group that extracts the value from within an item's HTML. */
  htmlFields?: Record<string, string>;
  /** Pagination config for html-dom schemas. Uses URL template with {offset} placeholder. */
  htmlPagination?: HtmlPaginationConfig;

  /**
   * Optional CSS-like selector for a container element that wraps the product listing.
   * When set, the HTML is narrowed to this container before chunking by itemSelector.
   * This avoids matching product-card elements in sidebars, recommendations, etc.
   * Example: 'div.product-list-container' or 'ul.search-results'
   */
  containerSelector?: string;

  /**
   * Optional login config for html-dom schemas that require an authenticated session.
   * When present, the scraper will POST to the login URL to obtain a fresh session
   * cookie before fetching product pages.
   */
  login?: {
    /** Login endpoint URL */
    url: string;
    /** POST body fields. Values support ${ENV_VAR} interpolation. */
    fields: Record<string, string>;
    /** Name of the session cookie to capture from the login response (e.g. 'JSESSIONID') */
    sessionCookie: string;
    /** Cookie header name to set on subsequent requests (defaults to the sessionCookie name) */
    cookieHeader?: string;
  };

  // --- api-json pagination ---
  /** Pagination config for api-json schemas. When present, the scraper will
   *  loop through pages until all products are fetched. */
  pagination?: ApiPaginationConfig;
}

export interface ApiPaginationConfig {
  /** How pagination is controlled: 'offset' (offset/limit in body) or 'page' (page param) */
  style: 'offset' | 'page';
  /** Where to send pagination params: 'body' (default) or 'query' (URL query params) */
  paginationIn?: 'body' | 'query';
  /** Body field name for the offset value (default: 'offset') */
  offsetParam?: string;
  /** Body field name for the page size (default: 'limit') */
  limitParam?: string;
  /** Number of items per page (default: 120) */
  pageSize?: number;
  /** Dot-path to the total item count in the API response (default: 'total') */
  totalPath?: string;
  /**
   * Template for the cursor/offset query param value.
   * Use `{offset}` as a placeholder for the numeric offset.
   * Example: "offset:{offset}" produces "offset:120", "offset:240", etc.
   * When set, only the offsetParam query param is sent (limitParam is omitted).
   */
  cursorTemplate?: string;
}

export interface HtmlPaginationConfig {
  /** URL template with {offset} placeholder, e.g. "/browse/electronics/_/N-123?No={offset}&Nrpp=32" */
  urlTemplate: string;
  /** Number of items per page (default: 32) */
  pageSize?: number;
  /** Maximum number of pages to fetch (default: 50) */
  maxPages?: number;
}

export interface PathConfig {
  /** Path to the array of products/variants in the extracted JSON */
  productsArray: string;
  /** Path to a single product object (for single-product pages) */
  singleProduct?: string;
  /** Path to variants array within a product object */
  variantsArray?: string;

  /** Field mappings — dot-notation paths relative to a product/variant object */
  fields: FieldMappings;
}

export interface FieldMappings {
  productId: string;
  skuId?: string;
  displayName: string;
  description?: string;
  brand?: string;
  listPrice: string;
  /** MSRP / compare-at price. When present and higher than listPrice, used as the reference price for discount calculation. */
  msrp?: string;
  activePrice?: string;
  salePrice?: string;
  imageUrl?: string;
  productUrl?: string;
  categories?: string;
  inStock?: string;
}

// ---------------------------------------------------------------------------
// Default schema (matches the existing __NEXT_DATA__ parser)
// ---------------------------------------------------------------------------

export const DEFAULT_SCHEMA: ProductPageSchema = {
  extraction: {
    method: 'script-json',
    selector: 'script#__NEXT_DATA__',
  },
  paths: {
    productsArray: 'props.pageProps.data.pageFolder.dataSourceConfigurations.0.preloadedValue.records',
    singleProduct: 'props.pageProps.data.pageFolder.dataSourceConfigurations.0.preloadedValue.product.gbProduct',
    variantsArray: 'variants',
    fields: {
      productId: 'productId|repositoryId|id',
      skuId: 'skuId|sku|key|id',
      displayName: 'displayName|colorDescription|name',
      brand: 'brands|brand',
      listPrice: 'listPrice',
      activePrice: 'activePrice',
      salePrice: 'salePrice',
      imageUrl: 'mediumImage|imageSet.0.url|imageSet.0|images.0.url|images.0',
      productUrl: 'relativeUrl|_url|url',
      categories: 'parentCategories|categories',
      inStock: 'isOnStock|availability.isOnStock|stockStatus',
    },
  },
};

// ---------------------------------------------------------------------------
// JSON extraction from HTML
// ---------------------------------------------------------------------------

function extractJsonFromHtml(
  html: string,
  config: ExtractionConfig
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | null {
  if (config.method === 'script-json') {
    return extractScriptJson(html, config.selector ?? 'script#__NEXT_DATA__');
  }
  if (config.method === 'json-ld') {
    return extractJsonLd(html, config.jsonLdType ?? 'Product');
  }
  if (config.method === 'meta-tags') {
    return extractMetaTags(html);
  }
  if (config.method === 'html-dom') {
    return extractHtmlDom(html, config);
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractScriptJson(html: string, selector: string): any | null {
  // Parse selector like 'script#__NEXT_DATA__' or 'script[type="application/json"]'
  let regex: RegExp;

  if (selector.includes('#')) {
    const id = selector.split('#')[1];
    regex = new RegExp(
      `<script[^>]*id=["']${escapeRegex(id)}["'][^>]*>([\\s\\S]*?)<\\/script>`,
      'i'
    );
  } else if (selector.includes('[')) {
    // Attribute selector like script[type="application/ld+json"]
    const attrMatch = /\[(\w+)=["']([^"']+)["']\]/.exec(selector);
    if (attrMatch) {
      regex = new RegExp(
        `<script[^>]*${escapeRegex(attrMatch[1])}=["']${escapeRegex(attrMatch[2])}["'][^>]*>([\\s\\S]*?)<\\/script>`,
        'i'
      );
    } else {
      regex = /<script[^>]*>([\s\S]*?)<\/script>/i;
    }
  } else {
    regex = /<script[^>]*>([\s\S]*?)<\/script>/i;
  }

  const match = regex.exec(html);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJsonLd(html: string, type: string): any | null {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      // Could be an array or single object
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === type) return item;
        // Check @graph
        if (Array.isArray(item['@graph'])) {
          const found = item['@graph'].find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (g: any) => g['@type'] === type
          );
          if (found) return found;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMetaTags(html: string): Record<string, any> {
  const result: Record<string, string> = {};
  const regex = /<meta\s+(?:property|name)=["']([^"']+)["']\s+content=["']([^"']+)["'][^>]*\/?>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    result[match[1]] = match[2];
  }
  return Object.keys(result).length > 0 ? result : null as unknown as Record<string, string>;
}

/**
 * Extract product data from HTML DOM using regex-based selectors.
 * Returns a synthetic JSON object with a `products` array that can be
 * processed by the standard extractFromData pipeline.
 *
 * The `itemSelector` splits the HTML into per-product chunks, then
 * `htmlFields` regexes extract field values from each chunk.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractHtmlDom(html: string, config: ExtractionConfig): any | null {
  const itemSelector = config.itemSelector;
  if (!itemSelector || !config.htmlFields) return null;

  // Optionally narrow the HTML to a container element before chunking.
  // This avoids matching itemSelector elements in sidebars, recommendations, etc.
  let searchHtml = html;
  if (config.containerSelector) {
    const container = parseItemSelector(config.containerSelector);
    let containerRegex: RegExp;
    if (container.id) {
      const escapedId = escapeRegex(container.id);
      containerRegex = new RegExp(
        `<${container.tagName}[^>]*id=["']${escapedId}["'][^>]*>`,
        'gi'
      );
    } else {
      const escapedCClass = escapeRegex(container.className);
      containerRegex = new RegExp(
        `<${container.tagName}[^>]*class=["'][^"']*\\b${escapedCClass}\\b[^"']*["'][^>]*>`,
        'gi'
      );
    }
    const containerMatch = containerRegex.exec(html);
    if (containerMatch) {
      // Find the matching closing tag by counting nesting depth
      const cTag = container.tagName;
      const startIdx = containerMatch.index;
      let depth = 1;
      const openRegex = new RegExp(`<${cTag}[\\s>]`, 'gi');
      const closeRegex = new RegExp(`</${cTag}>`, 'gi');
      openRegex.lastIndex = startIdx + containerMatch[0].length;
      closeRegex.lastIndex = startIdx + containerMatch[0].length;

      let endIdx = html.length;
      let searchPos = startIdx + containerMatch[0].length;

      while (depth > 0 && searchPos < html.length) {
        openRegex.lastIndex = searchPos;
        closeRegex.lastIndex = searchPos;
        const nextOpen = openRegex.exec(html);
        const nextClose = closeRegex.exec(html);

        if (!nextClose) break; // no more closing tags

        if (nextOpen && nextOpen.index < nextClose.index) {
          depth++;
          searchPos = nextOpen.index + nextOpen[0].length;
        } else {
          depth--;
          if (depth === 0) {
            endIdx = nextClose.index + nextClose[0].length;
          }
          searchPos = nextClose.index + nextClose[0].length;
        }
      }

      searchHtml = html.slice(startIdx, endIdx);
      console.log(
        `[schema-parser] containerSelector "${config.containerSelector}" narrowed HTML from ${html.length} to ${searchHtml.length} chars`,
      );
    } else {
      console.warn(
        `[schema-parser] containerSelector "${config.containerSelector}" not found in HTML — using full page`,
      );
    }
  }

  // Split HTML into product card chunks using the item selector as a delimiter.
  // We look for the opening tag that matches the selector pattern.
  // e.g. 'div.product-card' → <div class="...product-card...">
  const { tagName, className } = parseItemSelector(itemSelector);

  // Support both double-quoted and single-quoted class attributes
  const escapedClass = escapeRegex(className);
  const chunkRegex = new RegExp(
    `<${tagName}[^>]*class=["'][^"']*\\b${escapedClass}\\b[^"']*["'][^>]*>`,
    'gi'
  );

  // Find all opening tag positions and their full match length
  const matchPositions: { index: number; length: number }[] = [];
  let m;
  while ((m = chunkRegex.exec(searchHtml)) !== null) {
    matchPositions.push({ index: m.index, length: m[0].length });
  }

  if (matchPositions.length === 0) {
    // Debug: log a snippet of the HTML around the first occurrence of the class name
    // to help diagnose selector mismatches
    const classIdx = searchHtml.indexOf(className);
    if (classIdx >= 0) {
      const snippet = searchHtml.slice(Math.max(0, classIdx - 100), classIdx + 200).replace(/\n/g, ' ');
      console.warn(
        `[schema-parser] itemSelector "${itemSelector}" matched 0 elements via regex, ` +
        `but class name "${className}" found in HTML at index ${classIdx}. Snippet: ...${snippet}...`,
      );
    } else {
      console.warn(
        `[schema-parser] itemSelector "${itemSelector}" matched 0 elements — ` +
        `class name "${className}" not found anywhere in the HTML (${searchHtml.length} chars)`,
      );
    }
    return null;
  }

  // Extract each product chunk using proper tag-depth matching.
  // Instead of slicing from one match to the next (which creates tiny misaligned
  // chunks when there are many matches from sidebars/recommendations), we find
  // the closing tag for each matched element so the chunk contains the full element.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const products: any[] = [];
  const openTagRegex = new RegExp(`<${tagName}[\\s>/]`, 'gi');
  const closeTagRegex = new RegExp(`</${tagName}\\s*>`, 'gi');

  for (const pos of matchPositions) {
    // Find the closing tag by tracking nesting depth
    let depth = 1;
    let searchPos = pos.index + pos.length;
    let endIdx = searchHtml.length;

    while (depth > 0 && searchPos < searchHtml.length) {
      openTagRegex.lastIndex = searchPos;
      closeTagRegex.lastIndex = searchPos;
      const nextOpen = openTagRegex.exec(searchHtml);
      const nextClose = closeTagRegex.exec(searchHtml);

      if (!nextClose) break;

      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        searchPos = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        if (depth === 0) {
          endIdx = nextClose.index + nextClose[0].length;
        }
        searchPos = nextClose.index + nextClose[0].length;
      }
    }

    const chunk = searchHtml.slice(pos.index, endIdx);

    // Debug: log first chunk size on first invocation per page
    if (products.length === 0 && pos === matchPositions[0]) {
      console.log(`[schema-parser] First "${itemSelector}" chunk: ${chunk.length} chars (depth-matched)`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const product: Record<string, any> = {};
    for (const [field, pattern] of Object.entries(config.htmlFields)) {
      const fieldRegex = new RegExp(pattern, 'i');
      const fieldMatch = fieldRegex.exec(chunk);
      if (fieldMatch?.[1]) {
        // Decode HTML entities and trim
        product[field] = decodeHtmlEntities(fieldMatch[1].trim());
      }
    }

    // Only include products that have at least a productId
    if (product.productId) {
      products.push(product);
    }
  }

  if (products.length === 0 && matchPositions.length > 0) {
    const pidPattern = config.htmlFields.productId ?? '(none)';
    console.warn(
      `[schema-parser] Found ${matchPositions.length} "${itemSelector}" elements but 0 had a valid productId. ` +
      `productId regex: ${pidPattern}`,
    );
  }

  return { products };
}

/** Parse a simple CSS selector like 'div.product-card' or 'div#product-list' into tag + class/id */
export function parseItemSelector(selector: string): { tagName: string; className: string; id?: string } {
  const hashIndex = selector.indexOf('#');
  if (hashIndex !== -1) {
    return {
      tagName: selector.slice(0, hashIndex) || 'div',
      className: '',
      id: selector.slice(hashIndex + 1),
    };
  }
  const dotIndex = selector.indexOf('.');
  if (dotIndex === -1) return { tagName: selector, className: '' };
  return {
    tagName: selector.slice(0, dotIndex) || 'div',
    className: selector.slice(dotIndex + 1),
  };
}

/** Decode common HTML entities */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#47;/g, '/')
    .replace(/&nbsp;/g, ' ');
}


export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Dot-path resolution with fallback alternatives (pipe-separated)
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-notation path against an object.
 * Supports pipe-separated alternatives: "field1|field2|field3"
 * tries each in order and returns the first non-null result.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePath(obj: any, path: string): any {
  if (!obj || !path) return undefined;

  // Handle pipe-separated alternatives
  const alternatives = path.split('|');
  for (const alt of alternatives) {
    const result = resolveSimplePath(obj, alt.trim());
    if (result !== undefined && result !== null && result !== '') return result;
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveSimplePath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    // Handle array index
    if (/^\d+$/.test(part)) {
      current = Array.isArray(current) ? current[Number(part)] : current[part];
    } else {
      current = current[part];
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// Price / stock normalisation
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalisePrice(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'centAmount' in value) {
    const cents = Number(value.centAmount);
    const digits = Number(value.fractionDigits ?? 2);
    if (isNaN(cents) || isNaN(digits)) return null;
    return cents / Math.pow(10, digits);
  }
  // Handle string prices like "$29.99" or "29.99"
  const cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return isNaN(parsed) ? null : parsed;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseStock(value: any): boolean {
  if (value == null) return false; // null/undefined = out of stock or unknown
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower !== 'outofstock' && lower !== 'out_of_stock' && lower !== 'false' && lower !== 'soldout';
  }
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseCategories(raw: any): string[] {
  if (raw == null) return [];
  if (typeof raw === 'string') return raw ? [raw] : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item != null) {
        return item.displayName ?? item.name ?? item.category ?? null;
      }
      return null;
    })
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseBrand(raw: any): string | null {
  if (typeof raw === 'string' && raw) return raw;
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    return typeof first === 'string' ? first : first?.displayName ?? first?.name ?? null;
  }
  if (typeof raw === 'object' && raw?.name) return raw.name;
  return null;
}

// ---------------------------------------------------------------------------
// Public: parse HTML using a schema
// ---------------------------------------------------------------------------

/**
 * Parse product variants from HTML using a custom schema definition.
 * Returns an array of ProductVariant objects.
 *
 * NOTE: For api-json schemas, use parseWithApiSchema() instead — this
 * function only handles HTML-based extraction methods.
 */
export function parseWithSchema(
  html: string,
  schema: ProductPageSchema
): { variants: ProductVariant[]; pageType: 'listing' | 'product' | 'unknown' } {
  if (schema.extraction.method === 'api-json') {
    // api-json schemas should not be called with HTML — return empty
    return { variants: [], pageType: 'unknown' };
  }

  const data = extractJsonFromHtml(html, schema.extraction);
  if (!data) {
    return { variants: [], pageType: 'unknown' };
  }

  // For html-dom, the extracted data has a flat `products` array where
  // field names match the htmlFields keys directly. Map them through
  // paths.fields which should use the same keys.
  return extractFromData(data, schema.paths);
}

/**
 * Parse product variants from a pre-fetched JSON payload (for api-json schemas).
 */
export function parseFromApiData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  schema: ProductPageSchema
): { variants: ProductVariant[]; pageType: 'listing' | 'product' | 'unknown' } {
  if (!data) {
    return { variants: [], pageType: 'unknown' };
  }
  return extractFromData(data, schema.paths);
}

/**
 * Shared extraction logic — takes already-parsed JSON data and a PathConfig.
 */
function extractFromData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  paths: PathConfig
): { variants: ProductVariant[]; pageType: 'listing' | 'product' | 'unknown' } {
  const fields = paths.fields;

  // Try products array first (listing page)
  const productsArray = resolvePath(data, paths.productsArray);
  if (Array.isArray(productsArray) && productsArray.length > 0) {
    const variants: ProductVariant[] = [];
    for (const product of productsArray) {
      const productVariants = extractVariantsFromProduct(product, paths, fields);
      variants.push(...productVariants);
    }
    return { variants, pageType: 'listing' };
  }

  // Try single product path
  if (paths.singleProduct) {
    const product = resolvePath(data, paths.singleProduct);
    if (product) {
      const variants = extractVariantsFromProduct(product, paths, fields);
      return { variants, pageType: 'product' };
    }
  }

  // Try treating the entire data object as a single product (e.g. JSON-LD)
  const directVariants = extractVariantsFromProduct(data, paths, fields);
  if (directVariants.length > 0) {
    return { variants: directVariants, pageType: 'product' };
  }

  return { variants: [], pageType: 'unknown' };
}

// Debug: global sample counter for variant price logging
let _debugSampleCount = 0;

/** Reset the debug sample counter (call at start of each scrape job) */
export function resetDebugSampleCount(): void {
  _debugSampleCount = 0;
}

function extractVariantsFromProduct(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product: any,
  paths: PathConfig,
  fields: FieldMappings
): ProductVariant[] {
  // Check if product has a variants sub-array
  const variantsArray = paths.variantsArray
    ? resolvePath(product, paths.variantsArray)
    : null;

  const items = Array.isArray(variantsArray) && variantsArray.length > 0
    ? variantsArray
    : [product]; // treat the product itself as a single variant

  const results: ProductVariant[] = [];

  for (const item of items) {
    // Merge product-level and variant-level data (variant takes precedence,
    // but empty strings from the variant don't overwrite non-empty product values)
    let merged = item;
    if (item !== product) {
      merged = { ...product };
      for (const [key, value] of Object.entries(item)) {
        if (value !== '' && value !== undefined && value !== null) {
          merged[key] = value;
        }
      }
    }

    let rawListPrice = resolvePath(merged, fields.listPrice);
    let listPrice = normalisePrice(rawListPrice);
    // Fallback: use msrp if listPrice is missing
    if (listPrice == null && fields.msrp) {
      listPrice = normalisePrice(resolvePath(merged, fields.msrp));
    }
    // Fallback: if listPrice is still missing, try activePrice or salePrice.
    // This handles products where the only available price is the current
    // selling price (e.g. non-sale items that don't show a strikethrough price).
    // Ignore placeholder prices under $0.50 (e.g. $0.01 in some retail systems).
    if (listPrice == null || listPrice <= 0) {
      const fallbackActive = fields.activePrice
        ? normalisePrice(resolvePath(merged, fields.activePrice))
        : null;
      const fallbackSale = fields.salePrice
        ? normalisePrice(resolvePath(merged, fields.salePrice))
        : null;
      if (fallbackActive != null && fallbackActive > 0) {
        listPrice = fallbackActive;
      } else if (fallbackSale != null && fallbackSale > 0) {
        listPrice = fallbackSale;
      }
    }
    if (listPrice == null || listPrice <= 0) continue;

    // If msrp is mapped and higher than listPrice, use it as the reference price
    let referencePrice = listPrice;
    if (fields.msrp) {
      const msrp = normalisePrice(resolvePath(merged, fields.msrp));
      if (msrp != null && msrp > listPrice) {
        referencePrice = msrp;
      }
    }

    // Try activePrice, then fall back to 'price' field (matches original Lambda logic)
    let activePrice = fields.activePrice
      ? normalisePrice(resolvePath(merged, fields.activePrice))
      : null;
    if (activePrice == null) {
      const fallbackPrice = normalisePrice(resolvePath(merged, 'price'));
      if (fallbackPrice != null) {
        activePrice = fallbackPrice;
      }
    }
    const salePrice = fields.salePrice
      ? normalisePrice(resolvePath(merged, fields.salePrice))
      : null;

    const effectiveSalePrice = salePrice;

    const best = pickBestPrice(activePrice, effectiveSalePrice);
    // If no candidate prices, fall back to listPrice (0% discount) instead of
    // skipping — this keeps the variant visible for filters that don't require
    // a discount and avoids silently dropping products on pages where the site
    // doesn't render sale-price elements.
    const bestPrice = best != null && best < referencePrice ? best : listPrice;
    const discountPercentage = computeDiscount(referencePrice, bestPrice);

    const productId = String(resolvePath(merged, fields.productId) ?? 'unknown');
    const skuId = fields.skuId
      ? (resolvePath(merged, fields.skuId)?.toString() ?? null)
      : null;
    const displayName = String(
      resolvePath(merged, fields.displayName) ?? 'Unknown Product'
    );

    // Debug: log identity fields for the first 10 variants to diagnose unique product counting
    if (_debugSampleCount < 10) {
      _debugSampleCount++;
      const msrpNote = referencePrice !== listPrice ? `, msrp=${referencePrice}` : '';
      console.log(
        `[schema-parser] Sample variant: productId="${productId}", skuId="${skuId}", ` +
        `name="${displayName}", listPrice=${listPrice}${msrpNote}, ` +
        `activePrice=${activePrice}, salePrice=${effectiveSalePrice}, ` +
        `bestPrice=${bestPrice}, discount=${discountPercentage}%`,
      );
    }
    const description = fields.description
      ? (resolvePath(merged, fields.description)?.toString() ?? null)
      : null;
    const brand = fields.brand
      ? normaliseBrand(resolvePath(merged, fields.brand))
      : null;
    const imageUrl = fields.imageUrl
      ? (resolvePath(merged, fields.imageUrl)?.toString() ?? null)
      : null;
    const productUrl = fields.productUrl
      ? String(resolvePath(merged, fields.productUrl) ?? '')
      : '';
    const categories = fields.categories
      ? normaliseCategories(resolvePath(merged, fields.categories))
      : [];
    // For stock status, prefer the product-level value over variant-level
    // (variant stockStatus can be unreliable — e.g. always true)
    // But treat null/undefined product-level stock as "unknown" and fall through
    // to variant-level check.
    let inStock = true;
    if (fields.inStock) {
      const productStock = resolvePath(product, fields.inStock);
      if (productStock !== undefined && productStock !== null) {
        // Product-level stock is authoritative when present
        inStock = normaliseStock(productStock);
      } else {
        // Fall back to variant-level
        inStock = normaliseStock(resolvePath(item, fields.inStock));
      }
    }

    const compositeId = computeCompositeId(productId, skuId);

    results.push({
      productId,
      skuId,
      displayName,
      description,
      brand,
      listPrice: referencePrice,
      activePrice,
      salePrice: effectiveSalePrice,
      bestPrice,
      discountPercentage,
      imageUrl,
      productUrl,
      categories,
      inStock,
      compositeId,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Schema validation / parsing
// ---------------------------------------------------------------------------

/**
 * Parse and validate a JSON schema string.
 * Returns the parsed schema or an error message.
 */
export function parseSchemaJson(
  json: string
): { valid: true; schema: ProductPageSchema } | { valid: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { valid: false, error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}` };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, error: 'Schema must be a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;

  // Validate extraction
  if (!obj.extraction || typeof obj.extraction !== 'object') {
    return { valid: false, error: 'Missing "extraction" object' };
  }
  const ext = obj.extraction as Record<string, unknown>;
  if (!['script-json', 'json-ld', 'meta-tags', 'api-json', 'html-dom'].includes(ext.method as string)) {
    return { valid: false, error: 'extraction.method must be "script-json", "json-ld", "meta-tags", "api-json", or "html-dom"' };
  }

  // api-json requires an apiUrl
  if (ext.method === 'api-json' && typeof ext.apiUrl !== 'string') {
    return { valid: false, error: 'extraction.apiUrl is required for api-json method' };
  }

  // html-dom requires an itemSelector and htmlFields
  if (ext.method === 'html-dom') {
    if (typeof ext.itemSelector !== 'string') {
      return { valid: false, error: 'extraction.itemSelector is required for html-dom method' };
    }
    if (!ext.htmlFields || typeof ext.htmlFields !== 'object') {
      return { valid: false, error: 'extraction.htmlFields is required for html-dom method' };
    }
  }

  // Validate paths
  if (!obj.paths || typeof obj.paths !== 'object') {
    return { valid: false, error: 'Missing "paths" object' };
  }
  const paths = obj.paths as Record<string, unknown>;
  if (typeof paths.productsArray !== 'string') {
    return { valid: false, error: 'paths.productsArray must be a string' };
  }

  // Validate fields
  if (!paths.fields || typeof paths.fields !== 'object') {
    return { valid: false, error: 'Missing "paths.fields" object' };
  }
  const fields = paths.fields as Record<string, unknown>;
  if (typeof fields.productId !== 'string') {
    return { valid: false, error: 'paths.fields.productId is required' };
  }
  if (typeof fields.displayName !== 'string') {
    return { valid: false, error: 'paths.fields.displayName is required' };
  }
  if (typeof fields.listPrice !== 'string') {
    return { valid: false, error: 'paths.fields.listPrice is required' };
  }

  return { valid: true, schema: parsed as ProductPageSchema };
}
