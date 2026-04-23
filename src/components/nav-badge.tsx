import { getUnreadCount } from '@/lib/notification-service';
import { getSession } from '@/lib/auth-server';

export default async function NavBadge() {
  let count = 0;
  try {
    const session = await getSession();
    if (session) {
      count = await getUnreadCount(session.user.id);
    }
  } catch {
    count = 0;
  }

  if (count === 0) return null;

  return (
    <span className="text-xs font-medium tabular-nums text-orange-400">
      {count > 99 ? '99+' : count}
    </span>
  );
}
