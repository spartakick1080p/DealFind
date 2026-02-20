import { matchesAnyCategory, matchesAnyExcludedCategory } from './categories';

export interface ProductVariant {
  productId: string;
  skuId: string | null;
  displayName: string;
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
}

export interface FilterCriteria {
  discountThreshold: number; // 1-99
  maxPrice: number | null;
  keywords: string[];
  includedCategories: string[];
  excludedCategories: string[];
}

/**
 * Evaluates whether a product variant passes ALL criteria of a single filter.
 *
 * - Discount: variant.discountPercentage must be >= filter.discountThreshold
 * - Max price: if set, variant.bestPrice must be <= filter.maxPrice
 * - Keywords: if non-empty, variant.displayName must contain at least one keyword (case-insensitive)
 * - Included categories: if non-empty, product must match at least one (via alias mapping)
 * - Excluded categories: if non-empty, product must NOT match any (via alias mapping)
 */
export function evaluateVariant(
  variant: ProductVariant,
  filter: FilterCriteria
): boolean {
  // Discount threshold
  if (variant.discountPercentage < filter.discountThreshold) {
    return false;
  }

  // Max price check
  if (filter.maxPrice !== null && variant.bestPrice > filter.maxPrice) {
    return false;
  }

  // Keyword matching (case-insensitive)
  if (filter.keywords.length > 0) {
    const nameLower = variant.displayName.toLowerCase();
    const hasKeyword = filter.keywords.some((kw) =>
      nameLower.includes(kw.toLowerCase())
    );
    if (!hasKeyword) {
      return false;
    }
  }

  // Included categories — product must match at least one
  if (filter.includedCategories.length > 0) {
    if (!matchesAnyCategory(filter.includedCategories, variant.categories)) {
      return false;
    }
  }

  // Excluded categories — product must NOT match any
  if (filter.excludedCategories.length > 0) {
    if (matchesAnyExcludedCategory(filter.excludedCategories, variant.categories)) {
      return false;
    }
  }

  return true;
}

/**
 * Returns the subset of filters that the variant qualifies against.
 * A variant is considered a Deal if the returned array is non-empty.
 */
export function findMatchingFilters(
  variant: ProductVariant,
  filters: FilterCriteria[]
): FilterCriteria[] {
  return filters.filter((f) => evaluateVariant(variant, f));
}
