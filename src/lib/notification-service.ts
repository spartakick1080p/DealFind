/**
 * Notification service for creating and managing in-app deal notifications.
 *
 * Provides functions to create notifications for new deals, query unread counts,
 * retrieve active notifications with deal data, and update notification state.
 */

import { db } from '@/db';
import { notifications, deals, filters } from '@/db/schema';
import { eq, and, count, desc } from 'drizzle-orm';

/**
 * Type representing a notification joined with its associated deal data.
 */
export interface NotificationWithDeal {
  id: string;
  dealId: string;
  read: boolean;
  dismissed: boolean;
  createdAt: Date;
  deal: {
    productName: string;
    brand: string | null;
    listPrice: string;
    bestPrice: string;
    discountPercentage: string;
    imageUrl: string | null;
    productUrl: string;
    filterName: string | null;
  };
}

/**
 * Create a new notification for a deal.
 * Inserts a notification record linked to the given deal ID.
 */
export async function createNotification(dealId: string): Promise<void> {
  await db.insert(notifications).values({ dealId });
}

/**
 * Get the count of unread, non-dismissed notifications.
 */
export async function getUnreadCount(): Promise<number> {
  const result = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.read, false),
        eq(notifications.dismissed, false)
      )
    );

  return result[0]?.value ?? 0;
}

/**
 * Get all active (non-dismissed) notifications with their associated deal data,
 * ordered by creation date descending (newest first).
 */
export async function getActiveNotifications(): Promise<NotificationWithDeal[]> {
  const rows = await db
    .select({
      id: notifications.id,
      dealId: notifications.dealId,
      read: notifications.read,
      dismissed: notifications.dismissed,
      createdAt: notifications.createdAt,
      deal: {
        productName: deals.productName,
        brand: deals.brand,
        listPrice: deals.listPrice,
        bestPrice: deals.bestPrice,
        discountPercentage: deals.discountPercentage,
        imageUrl: deals.imageUrl,
        productUrl: deals.productUrl,
        filterName: filters.name,
      },
    })
    .from(notifications)
    .innerJoin(deals, eq(notifications.dealId, deals.id))
    .leftJoin(filters, eq(deals.filterId, filters.id))
    .where(eq(notifications.dismissed, false))
    .orderBy(desc(notifications.createdAt));

  return rows;
}

/**
 * Mark a notification as read.
 */
export async function markAsRead(notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(eq(notifications.id, notificationId));
}

/**
 * Dismiss a notification (removes it from the active list).
 */
export async function dismiss(notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ dismissed: true })
    .where(eq(notifications.id, notificationId));
}

/**
 * Mark all non-dismissed notifications as read.
 */
export async function markAllAsRead(): Promise<void> {
  await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.dismissed, false),
        eq(notifications.read, false),
      ),
    );
}

/**
 * Dismiss all non-dismissed notifications.
 */
export async function dismissAll(): Promise<void> {
  await db
    .update(notifications)
    .set({ dismissed: true })
    .where(eq(notifications.dismissed, false));
}
