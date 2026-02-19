/**
 * Seen item tracker for duplicate deal detection.
 *
 * Provides composite ID computation for uniquely identifying product variants,
 * and database operations for tracking seen items with TTL-based expiry.
 */

import { db } from '@/db';
import { seenItems } from '@/db/schema';
import { eq, lt } from 'drizzle-orm';

/**
 * Compute a composite identifier for duplicate detection.
 * Returns "productId:skuId" when skuId is present and non-null,
 * and "productId" when skuId is null or absent.
 */
export function computeCompositeId(
  productId: string,
  skuId: string | null
): string {
  if (skuId != null && skuId !== '') {
    return `${productId}:${skuId}`;
  }
  return productId;
}

/**
 * Check if a composite ID is new (not seen or expired).
 * Returns true if the deal is new, false if already seen and not expired.
 */
export async function isNewDeal(compositeId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(seenItems)
    .where(eq(seenItems.compositeId, compositeId))
    .limit(1);

  if (rows.length === 0) {
    return true;
  }

  const item = rows[0];
  return item.expiresAt < new Date();
}

/**
 * Mark a composite ID as seen with a TTL expiry.
 * Uses upsert (insert on conflict update) to refresh TTL for existing items.
 */
export async function markAsSeen(
  compositeId: string,
  ttlDays: number
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  await db
    .insert(seenItems)
    .values({ compositeId, expiresAt })
    .onConflictDoUpdate({
      target: seenItems.compositeId,
      set: { expiresAt },
    });
}

/**
 * Clean up expired seen items. Returns the count of deleted items.
 */
export async function cleanExpiredItems(): Promise<number> {
  const deleted = await db
    .delete(seenItems)
    .where(lt(seenItems.expiresAt, new Date()))
    .returning();

  return deleted.length;
}
