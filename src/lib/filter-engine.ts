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
  excludedCategories: string[];
}

/**
 * Evaluates whether a product variant passes ALL criteria of a single filter.
 *
 * - Discount: variant.discountPercentage must be >= filter.discountThreshold
 * - Max price: if set, variant.bestPrice must be <= filter.maxPrice
 * - Keywords: if non-empty, variant.displayName must contain at least one keyword (case-insensitive)
 * - Excluded categories: if non-empty, none of the variant's categories may match an excluded category (case-insensitive)
 */
export function evaluateVariant(
  variant: ProductVariant,
  filter: FilterCriteria
): boolean {
  // Req 7.1 — discount threshold
  if (variant.discountPercentage < filter.discountThreshold) {
    return false;
  }

  // Req 7.2 — max price check
  if (filter.maxPrice !== null && variant.bestPrice > filter.maxPrice) {
    return false;
  }

  // Req 7.3 — keyword matching (case-insensitive)
  if (filter.keywords.length > 0) {
    const nameLower = variant.displayName.toLowerCase();
    const hasKeyword = filter.keywords.some((kw) =>
      nameLower.includes(kw.toLowerCase())
    );
    if (!hasKeyword) {
      return false;
    }
  }

  // Req 7.4 — category exclusion (case-insensitive)
  if (filter.excludedCategories.length > 0) {
    const excludedLower = filter.excludedCategories.map((c) => c.toLowerCase());
    const hasExcluded = variant.categories.some((cat) =>
      excludedLower.includes(cat.toLowerCase())
    );
    if (hasExcluded) {
      return false;
    }
  }

  return true;
}

/**
 * Returns the subset of filters that the variant qualifies against.
 * A variant is considered a Deal if the returned array is non-empty (Req 7.5).
 */
export function findMatchingFilters(
  variant: ProductVariant,
  filters: FilterCriteria[]
): FilterCriteria[] {
  return filters.filter((f) => evaluateVariant(variant, f));
}
