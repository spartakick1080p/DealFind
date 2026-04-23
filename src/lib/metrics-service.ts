/**
 * Metrics service for computing dashboard statistics and tracking purchases.
 *
 * Provides functions to retrieve aggregate metrics (deals found, items purchased,
 * dollars saved), fetch recent deals, and mark deals as purchased.
 */

import { db } from '@/db';
import { deals, purchases } from '@/db/schema';
import { count, desc, eq, sql } from 'drizzle-orm';
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
export async function getDashboardMetrics(userId: string): Promise<DashboardMetrics> {
  const [dealsCount] = await db
    .select({ value: count() })
    .from(deals)
    .where(eq(deals.userId, userId));

  const [purchasesCount] = await db
    .select({ value: count() })
    .from(purchases)
    .innerJoin(deals, sql`${purchases.dealId} = ${deals.id}`)
    .where(eq(deals.userId, userId));

  const [savingsResult] = await db
    .select({
      value: sql<string>`coalesce(sum(${deals.listPrice} - ${deals.bestPrice}), 0)`,
    })
    .from(purchases)
    .innerJoin(deals, sql`${purchases.dealId} = ${deals.id}`)
    .where(eq(deals.userId, userId));

  return {
    totalDealsFound: dealsCount?.value ?? 0,
    totalItemsPurchased: purchasesCount?.value ?? 0,
    totalDollarsSaved: parseFloat(savingsResult?.value ?? '0'),
  };
}

/**
 * Get the most recent deals, ordered by foundAt descending.
 */
export async function getRecentDeals(userId: string, limit: number) {
  return db
    .select()
    .from(deals)
    .where(eq(deals.userId, userId))
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
export async function clearAllDeals(userId: string): Promise<void> {
  // Delete purchases for this user's deals, then deals
  const userDeals = await db.select({ id: deals.id }).from(deals).where(eq(deals.userId, userId));
  if (userDeals.length > 0) {
    const dealIds = userDeals.map(d => d.id);
    await db.delete(purchases).where(sql`${purchases.dealId} IN (${sql.join(dealIds.map(id => sql`${id}`), sql`, `)})`);
    await db.delete(deals).where(eq(deals.userId, userId));
  }
  revalidatePath('/');
}

