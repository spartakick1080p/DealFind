import { revalidatePath } from 'next/cache';
import Image from 'next/image';
import {
  getActiveNotifications,
  markAsRead,
  dismiss,
  type NotificationWithDeal,
} from '@/lib/notification-service';
import NotificationActions from '@/components/notification-actions';

async function handleMarkAsRead(notificationId: string) {
  'use server';
  await markAsRead(notificationId);
  revalidatePath('/notifications');
}

async function handleDismiss(notificationId: string) {
  'use server';
  await dismiss(notificationId);
  revalidatePath('/notifications');
}

export default async function NotificationsPage() {
  let notificationList: NotificationWithDeal[] = [];

  try {
    notificationList = await getActiveNotifications();
  } catch {
    // Graceful fallback when DB is unavailable
  }

  const unreadCount = notificationList.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Notifications</h1>
        {unreadCount > 0 && (
          <span className="badge badge-primary">{unreadCount} unread</span>
        )}
      </div>

      {notificationList.length > 0 ? (
        <div className="space-y-4">
          {notificationList.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
            />
          ))}
        </div>
      ) : (
        <div className="card bg-base-300 shadow-lg p-8 text-center">
          <p className="text-base-content/60">
            No notifications yet. Deals matching your filters will appear here.
          </p>
        </div>
      )}
    </div>
  );
}


function NotificationCard({ notification }: { notification: NotificationWithDeal }) {
  const { deal } = notification;
  const discount = parseFloat(deal.discountPercentage);
  const bestPrice = parseFloat(deal.bestPrice);
  const listPrice = parseFloat(deal.listPrice);
  const timeAgo = getTimeAgo(notification.createdAt);

  return (
    <div
      className={`card bg-base-300 shadow-lg transition-opacity ${
        notification.read ? 'opacity-60' : ''
      }`}
    >
      <div className="card-body p-4 gap-3">
        <div className="flex items-start gap-3">
          {deal.imageUrl ? (
            <Image
              src={deal.imageUrl}
              alt={deal.productName}
              width={64}
              height={64}
              className="rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-neutral flex items-center justify-center shrink-0">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-base-content/30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {!notification.read && (
                <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
              )}
              <h3
                className="font-semibold text-sm leading-tight truncate"
                title={deal.productName}
              >
                {deal.productName}
              </h3>
            </div>
            {deal.brand && (
              <p className="text-xs text-base-content/50 mt-0.5">{deal.brand}</p>
            )}
            <p className="text-xs text-base-content/40 mt-1">{timeAgo}</p>
          </div>

          <span className="text-xl font-bold text-primary shrink-0">
            {discount.toFixed(0)}%
          </span>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-primary">
              ${bestPrice.toFixed(2)}
            </span>
            <span className="text-sm text-base-content/40 line-through">
              ${listPrice.toFixed(2)}
            </span>
            <a
              href={deal.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-xs btn-ghost text-primary"
            >
              View Deal →
            </a>
          </div>

          <NotificationActions
            notificationId={notification.id}
            isRead={notification.read}
            onMarkAsRead={handleMarkAsRead}
            onDismiss={handleDismiss}
          />
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
