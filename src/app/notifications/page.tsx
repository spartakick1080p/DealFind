import { revalidatePath } from 'next/cache';
import {
  getActiveNotifications,
  markAsRead,
  dismiss,
  markAllAsRead,
  dismissAll,
  type NotificationWithDeal,
} from '@/lib/notification-service';
import NotificationList from '@/components/notification-list';

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

async function handleMarkAllRead() {
  'use server';
  await markAllAsRead();
  revalidatePath('/notifications');
}

async function handleDismissAll() {
  'use server';
  await dismissAll();
  revalidatePath('/notifications');
}

export default async function NotificationsPage() {
  let notificationList: NotificationWithDeal[] = [];

  try {
    notificationList = await getActiveNotifications();
  } catch {
    // Graceful fallback when DB is unavailable
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Notifications</h1>

      <NotificationList
        notifications={notificationList}
        onMarkAsRead={handleMarkAsRead}
        onDismiss={handleDismiss}
        onMarkAllRead={handleMarkAllRead}
        onDismissAll={handleDismissAll}
      />
    </div>
  );
}
