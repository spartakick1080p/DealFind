import { getUnreadCount } from '@/lib/notification-service';

export default async function NavBadge() {
  let count = 0;
  try {
    count = await getUnreadCount();
  } catch {
    // Graceful fallback if database is unavailable
    count = 0;
  }

  if (count === 0) return null;

  return (
    <span className="text-xs font-medium tabular-nums text-orange-400">
      {count > 99 ? '99+' : count}
    </span>
  );
}
