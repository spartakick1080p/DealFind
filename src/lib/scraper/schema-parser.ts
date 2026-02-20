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
  /** 'script-json' = parse JSON from a <script> tag, 'json-ld' = parse JSON-LD, 'api-json' = fetch JSON from an API */
  method: 'script-json' | 'json-ld' | 'meta-tags' | 'api-json';
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

function escapeRegex(str: string): string {
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

    const best = pickBestPrice(activePrice, salePrice);
    // If no candidate prices at all, skip this variant (no discount can be computed)
    if (best == null) continue;
    const bestPrice = best < referencePrice ? best : listPrice;
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
        `activePrice=${activePrice}, salePrice=${salePrice}, ` +
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
      salePrice,
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
  if (!['script-json', 'json-ld', 'meta-tags', 'api-json'].includes(ext.method as string)) {
    return { valid: false, error: 'extraction.method must be "script-json", "json-ld", "meta-tags", or "api-json"' };
  }

  // api-json requires an apiUrl
  if (ext.method === 'api-json' && typeof ext.apiUrl !== 'string') {
    return { valid: false, error: 'extraction.apiUrl is required for api-json method' };
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
