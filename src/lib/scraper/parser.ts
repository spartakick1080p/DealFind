/**
 * Product page parser for Deal Monitor.
 *
 * Pure parsing module — no HTTP calls. Extracts product data from
 * Next.js __NEXT_DATA__ payloads found in HTML pages. Handles both
 * listing pages (with pagination and records array) and individual
 * product pages (with gbProduct + variants).
 */

import { computeDiscount, pickBestPrice } from '@/lib/discount';
import { computeCompositeId } from '@/lib/seen-tracker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw __NEXT_DATA__ JSON payload (loosely typed). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NextDataPayload = Record<string, any>;

export interface ProductVariant {
  productId: string;
  skuId: string | null;
  displayName: string;
  description: string | null;
  brand: string | null;
  listPrice: number;
  activePrice: number | null;
  salePrice: number | null;
  bestPrice: number;
  discountPercentage: number;
  imageUrl: string | null;
  productUrl: string;
  categories: string[];
  inStock: boolean;
  compositeId: string;
}

// ---------------------------------------------------------------------------
// HTML → JSON extraction
// ---------------------------------------------------------------------------

/**
 * Extract the __NEXT_DATA__ JSON payload from raw HTML.
 * Returns null if the script tag is missing or the JSON is malformed.
 */
export function parseNextData(html: string): NextDataPayload | null {
  const regex = /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/i;
  const match = regex.exec(html);
  if (!match || !match[1]) return null;

  try {
    return JSON.parse(match[1]) as NextDataPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Payload introspection helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the preloadedValue from the standard Next.js data path:
 * props.pageProps.data.pageFolder.dataSourceConfigurations[0].preloadedValue
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPreloadedValue(payload: NextDataPayload): any | null {
  try {
    const configs =
      payload?.props?.pageProps?.data?.pageFolder?.dataSourceConfigurations;
    if (!Array.isArray(configs) || configs.length === 0) return null;
    return configs[0].preloadedValue ?? null;
  } catch {
    return null;
  }
}

/** True when the preloadedValue contains a `records` array (listing page). */
export function isListingPage(payload: NextDataPayload): boolean {
  const pv = getPreloadedValue(payload);
  return pv != null && Array.isArray(pv.records);
}

/** True when the preloadedValue contains `product.gbProduct` (product page). */
export function isProductPage(payload: NextDataPayload): boolean {
  const pv = getPreloadedValue(payload);
  return pv?.product?.gbProduct != null;
}

/**
 * Return the total page count from a listing page payload.
 * Returns 1 if the field is missing (single-page listing).
 */
export function getPageCount(payload: NextDataPayload): number {
  const pv = getPreloadedValue(payload);
  if (pv == null) return 1;
  const count = pv.pageCount ?? pv.totalPages ?? 1;
  return typeof count === 'number' && count >= 1 ? count : 1;
}

// ---------------------------------------------------------------------------
// Money / price normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise a price value that may be:
 *  - a plain number
 *  - a money object { centAmount, fractionDigits }
 *  - null / undefined
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseMoney(value: any): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'centAmount' in value) {
    const cents = Number(value.centAmount);
    const digits = Number(value.fractionDigits ?? 2);
    if (isNaN(cents) || isNaN(digits)) return null;
    return cents / Math.pow(10, digits);
  }
  const parsed = Number(value);
  return isNaN(parsed) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Category normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise categories from various shapes:
 *  - string → [string]
 *  - string[] → as-is
 *  - object[] with displayName / name / category keys → extract strings
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseCategories(raw: any): string[] {
  if (raw == null) return [];
  if (typeof raw === 'string') return raw ? [raw] : [];
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item != null) {
        return (
          item.displayName ?? item.name ?? item.category ?? null
        );
      }
      return null;
    })
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
}

// ---------------------------------------------------------------------------
// Image URL extraction
// ---------------------------------------------------------------------------

/**
 * Pick the best available image URL from a variant and its parent product.
 * Checks variant.mediumImage, variant.imageSet, variant.images, then
 * the parent product's mediumImage.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickImageUrl(variant: any, product: any): string | null {
  // Variant-level images
  if (typeof variant?.mediumImage === 'string' && variant.mediumImage) {
    return variant.mediumImage;
  }
  if (Array.isArray(variant?.imageSet) && variant.imageSet.length > 0) {
    const first = variant.imageSet[0];
    if (typeof first === 'string') return first;
    if (typeof first?.url === 'string') return first.url;
  }
  if (Array.isArray(variant?.images) && variant.images.length > 0) {
    const first = variant.images[0];
    if (typeof first === 'string') return first;
    if (typeof first?.url === 'string') return first.url;
  }

  // Product-level fallback
  if (typeof product?.mediumImage === 'string' && product.mediumImage) {
    return product.mediumImage;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stock status extraction
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isVariantInStock(variant: any): boolean {
  if (typeof variant?.isOnStock === 'boolean') return variant.isOnStock;
  if (typeof variant?.availability?.isOnStock === 'boolean')
    return variant.availability.isOnStock;
  if (typeof variant?.stockStatus === 'string')
    return variant.stockStatus.toLowerCase() !== 'outofstock';
  // Default to true if no stock info is available
  return true;
}

// ---------------------------------------------------------------------------
// Variant ID extraction
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSkuId(variant: any): string | null {
  const raw = variant?.skuId ?? variant?.sku ?? variant?.key ?? variant?.id;
  if (raw == null) return null;
  const str = String(raw);
  return str.length > 0 ? str : null;
}

// ---------------------------------------------------------------------------
// Product-level field extraction
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractProductId(product: any): string {
  return String(product?.productId ?? product?.repositoryId ?? product?.id ?? 'unknown');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractDisplayName(product: any, variant: any): string {
  return (
    variant?.displayName ??
    variant?.colorDescription ??
    product?.displayName ??
    product?.name ??
    'Unknown Product'
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBrand(product: any): string | null {
  if (typeof product?.brands === 'string' && product.brands) return product.brands;
  if (Array.isArray(product?.brands) && product.brands.length > 0) {
    const first = product.brands[0];
    return typeof first === 'string'
      ? first
      : first?.displayName ?? first?.name ?? null;
  }
  if (typeof product?.brand === 'string' && product.brand) return product.brand;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractProductUrl(product: any): string {
  return product?.relativeUrl ?? product?._url ?? product?.url ?? '';
}

// ---------------------------------------------------------------------------
// Core variant extraction from a single record/product
// ---------------------------------------------------------------------------

/**
 * Build ProductVariant objects from a product record and its variants array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildVariants(product: any, variants: any[]): ProductVariant[] {
  const productId = extractProductId(product);
  const brand = extractBrand(product);
  const productUrl = extractProductUrl(product);
  const categories = normaliseCategories(product?.parentCategories ?? product?.categories);

  const results: ProductVariant[] = [];

  for (const v of variants) {
    const listPrice = normaliseMoney(v.listPrice);
    if (listPrice == null || listPrice <= 0) continue;

    const activePrice = normaliseMoney(v.activePrice);
    const salePrice = normaliseMoney(v.salePrice);
    const best = pickBestPrice(activePrice, salePrice);
    const bestPrice = best != null && best < listPrice ? best : listPrice;
    const discountPercentage = computeDiscount(listPrice, bestPrice);

    const skuId = extractSkuId(v);
    const displayName = extractDisplayName(product, v);
    const imageUrl = pickImageUrl(v, product);
    const inStock = isVariantInStock(v);
    const compositeId = computeCompositeId(productId, skuId);

    results.push({
      productId,
      skuId,
      displayName,
      description: null,
      brand,
      listPrice,
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
// Public API — extract variants from a parsed payload
// ---------------------------------------------------------------------------

/**
 * Extract all ProductVariant objects from a parsed __NEXT_DATA__ payload.
 * Handles both listing pages (records array) and individual product pages.
 */
export function extractProductVariants(payload: NextDataPayload): ProductVariant[] {
  const pv = getPreloadedValue(payload);
  if (pv == null) return [];

  // Listing page: records array, each record may have variants
  if (Array.isArray(pv.records)) {
    const results: ProductVariant[] = [];
    for (const record of pv.records) {
      const variants = record.variants ?? record.childSkus ?? [];
      if (Array.isArray(variants) && variants.length > 0) {
        results.push(...buildVariants(record, variants));
      } else {
        // Treat the record itself as a single variant
        results.push(...buildVariants(record, [record]));
      }
    }
    return results;
  }

  // Product page: product.gbProduct with product.variants
  if (pv.product?.gbProduct) {
    const gbProduct = pv.product.gbProduct;
    const variants = pv.product.variants ?? gbProduct.variants ?? [];
    if (Array.isArray(variants) && variants.length > 0) {
      return buildVariants(gbProduct, variants);
    }
    // Single product with no variant array — treat gbProduct as the variant
    return buildVariants(gbProduct, [gbProduct]);
  }

  return [];
}
