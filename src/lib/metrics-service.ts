/**
 * Metrics service for computing dashboard statistics and tracking purchases.
 *
 * Provides functions to retrieve aggregate metrics (deals found, items purchased,
 * dollars saved), fetch recent deals, and mark deals as purchased.
 */

import { db } from '@/db';
import { deals, purchases } from '@/db/schema';
import { count, desc, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export interface DashboardMetrics {
  totalDealsFound: number;
  totalItemsPurchased: number;
  totalDollarsSaved: number;
}

/**
 * Get aggregate dashboard metrics.
 *
 * - totalDealsFound: count of all rows in the deals table
 * - totalItemsPurchased: count of all rows in the purchases table
 * - totalDollarsSaved: sum of (listPrice - bestPrice) for all deals that have a purchase record
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [dealsCount] = await db
    .select({ value: count() })
    .from(deals);

  const [purchasesCount] = await db
    .select({ value: count() })
    .from(purchases);

  const [savingsResult] = await db
    .select({
      value: sql<string>`coalesce(sum(${deals.listPrice} - ${deals.bestPrice}), 0)`,
    })
    .from(purchases)
    .innerJoin(deals, sql`${purchases.dealId} = ${deals.id}`);

  return {
    totalDealsFound: dealsCount?.value ?? 0,
    totalItemsPurchased: purchasesCount?.value ?? 0,
    totalDollarsSaved: parseFloat(savingsResult?.value ?? '0'),
  };
}

/**
 * Get the most recent deals, ordered by foundAt descending.
 */
export async function getRecentDeals(limit: number) {
  return db
    .select()
    .from(deals)
    .orderBy(desc(deals.foundAt))
    .limit(limit);
}

/**
 * Mark a deal as purchased by inserting a purchase record.
 * Revalidates the dashboard after insertion.
 */
export async function markAsPurchased(dealId: string, actualPrice: number): Promise<void> {
  await db.insert(purchases).values({
    dealId,
    actualPrice: actualPrice.toString(),
  });

  revalidatePath('/');
}

/**
 * Delete all deals (and related purchases / notifications) to clear the dashboard.
 * Revalidates the dashboard after deletion.
 */
export async function clearAllDeals(): Promise<void> {
  await db.delete(purchases);
  await db.delete(deals);
  revalidatePath('/');
}

