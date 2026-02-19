/**
 * Discount computation utilities for Deal Monitor.
 *
 * Provides functions to determine the best available price from candidate
 * prices and to compute the discount percentage relative to the list price.
 */

/**
 * Pick the best (lowest) price from available candidate prices.
 * Returns the minimum of non-null candidates, or null if none provided.
 */
export function pickBestPrice(
  activePrice: number | null,
  salePrice: number | null
): number | null {
  if (activePrice !== null && salePrice !== null) {
    return Math.min(activePrice, salePrice);
  }
  if (activePrice !== null) return activePrice;
  if (salePrice !== null) return salePrice;
  return null;
}

/**
 * Compute discount percentage: ((listPrice - bestPrice) / listPrice) * 100
 * Rounded to 2 decimal places.
 * listPrice must be > 0.
 */
export function computeDiscount(listPrice: number, bestPrice: number): number {
  const raw = ((listPrice - bestPrice) / listPrice) * 100;
  return Math.round(raw * 100) / 100;
}
