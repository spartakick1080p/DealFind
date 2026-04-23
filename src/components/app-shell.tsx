'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import SidebarNav from './sidebar-nav';

const AUTH_PAGES = ['/login', '/signup'];

export default function AppShell({
  children,
  notificationBadge,
}: {
  children: ReactNode;
  notificationBadge: ReactNode;
}) {
  const pathname = usePathname();
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <SidebarNav notificationBadge={notificationBadge} />
      <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-20 md:pb-8 bg-[#121212]">
        {children}
      </main>
    </div>
  );
}
