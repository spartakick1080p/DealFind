'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

interface NavItem {
  href: string;
  label: string;
  iconPath: string;
  badge?: ReactNode;
}

const ICON_PATHS = {
  dashboard:
    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z',
  websites:
    'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9',
  filters:
    'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z',
  notifications:
    'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9',
  settings:
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  testScrape:
    'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
};

export default function SidebarNav({ notificationBadge }: { notificationBadge: ReactNode }) {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { href: '/', label: 'Dashboard', iconPath: ICON_PATHS.dashboard },
    { href: '/websites', label: 'Websites', iconPath: ICON_PATHS.websites },
    { href: '/filters', label: 'Filters', iconPath: ICON_PATHS.filters },
    { href: '/notifications', label: 'Notifications', iconPath: ICON_PATHS.notifications, badge: notificationBadge },
    { href: '/test-scrape', label: 'Test Scrape', iconPath: ICON_PATHS.testScrape },
    { href: '/settings', label: 'Settings', iconPath: ICON_PATHS.settings },
  ];

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-col md:w-64 md:min-h-screen bg-[#0a0a0a] border-r border-white/10">
        <div className="flex h-16 shrink-0 items-center px-6 border-b border-white/10">
          <Link href="/" className="flex items-center gap-1.5">
            <span className="text-orange-500 text-xl font-bold tracking-tight">Deal</span>
            <span className="text-gray-300 text-xl font-light tracking-tight">Monitor</span>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col px-4 py-4">
          <ul role="list" className="flex flex-1 flex-col gap-y-1">
            <li>
              <ul role="list" className="space-y-1">
                {navItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={
                        (isActive(item.href)
                          ? 'bg-white/10 text-orange-500'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white') +
                        ' group flex gap-x-3 rounded-md px-3 py-2 text-sm font-semibold'
                      }
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="size-5 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
                      </svg>
                      {item.label}
                      {item.badge && (
                        <span className="ml-auto">
                          <Suspense>{item.badge}</Suspense>
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </nav>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a] border-t border-white/10 shadow-[0_-2px_10px_rgba(0,0,0,0.5)]">
        <ul className="flex justify-around items-center h-16">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={
                  (isActive(item.href)
                    ? 'text-orange-500'
                    : 'text-gray-500 hover:text-gray-300') +
                  ' flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-md transition-colors'
                }
              >
                <span className="relative">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="size-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
                  </svg>
                  {item.badge && (
                    <span className="absolute -top-1.5 -right-2.5">
                      <Suspense>{item.badge}</Suspense>
                    </span>
                  )}
                </span>
                <span className="text-xs">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
