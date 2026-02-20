'use client';

import { useState, useMemo, useTransition } from 'react';
import Image from 'next/image';
import type { NotificationWithDeal } from '@/lib/notification-service';
import NotificationActions from './notification-actions';
import { CATEGORIES } from '@/lib/categories';

type SortOption = 'newest' | 'discount-desc' | 'discount-asc' | 'price-asc' | 'price-desc';

interface NotificationListProps {
  notifications: NotificationWithDeal[];
  onMarkAsRead: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onDismissAll: () => Promise<void>;
}

/** Check if a notification's product name or brand fuzzy-matches a canonical category */
function matchesCategory(n: NotificationWithDeal, categoryValue: string): boolean {
  const def = CATEGORIES.find((c) => c.value === categoryValue);
  if (!def) return false;
  const text = `${n.deal.productName} ${n.deal.brand ?? ''}`.toLowerCase();
  return def.aliases.some((alias) => text.includes(alias));
}

export default function NotificationList({
  notifications,
  onMarkAsRead,
  onDismiss,
  onMarkAllRead,
  onDismissAll,
}: NotificationListProps) {
  const [brandFilter, setBrandFilter] = useState('');
  const [filterFilter, setFilterFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [isBulkPending, startBulkTransition] = useTransition();

  // Build unique brand and filter lists
  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const n of notifications) {
      if (n.deal.brand) set.add(n.deal.brand);
    }
    return [...set].sort();
  }, [notifications]);

  const filterNames = useMemo(() => {
    const set = new Set<string>();
    for (const n of notifications) {
      if (n.deal.filterName) set.add(n.deal.filterName);
    }
    return [...set].sort();
  }, [notifications]);

  // Build category list with counts (only categories that match at least one notification)
  const availableCategories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notifications) {
      for (const cat of CATEGORIES) {
        if (matchesCategory(n, cat.value)) {
          counts.set(cat.value, (counts.get(cat.value) ?? 0) + 1);
        }
      }
    }
    return CATEGORIES
      .filter((c) => counts.has(c.value))
      .map((c) => ({ value: c.value, label: c.label, count: counts.get(c.value)! }))
      .sort((a, b) => b.count - a.count);
  }, [notifications]);

  // Apply filters and sort
  const filtered = useMemo(() => {
    let list = notifications;

    if (brandFilter) {
      list = list.filter((n) => n.deal.brand === brandFilter);
    }
    if (filterFilter) {
      list = list.filter((n) => n.deal.filterName === filterFilter);
    }
    if (categoryFilter) {
      list = list.filter((n) => matchesCategory(n, categoryFilter));
    }

    const sorted = [...list];
    switch (sort) {
      case 'discount-desc':
        sorted.sort((a, b) => parseFloat(b.deal.discountPercentage) - parseFloat(a.deal.discountPercentage));
        break;
      case 'discount-asc':
        sorted.sort((a, b) => parseFloat(a.deal.discountPercentage) - parseFloat(b.deal.discountPercentage));
        break;
      case 'price-asc':
        sorted.sort((a, b) => parseFloat(a.deal.bestPrice) - parseFloat(b.deal.bestPrice));
        break;
      case 'price-desc':
        sorted.sort((a, b) => parseFloat(b.deal.bestPrice) - parseFloat(a.deal.bestPrice));
        break;
      default:
        // newest first — already sorted by server
        break;
    }

    return sorted;
  }, [notifications, brandFilter, filterFilter, categoryFilter, sort]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card bg-base-300 shadow-lg">
        <div className="card-body p-4 gap-3">
          <div className="flex flex-wrap items-end gap-3">
            {/* Brand filter */}
            <label className="form-control">
              <div className="label py-0"><span className="label-text text-xs">Brand</span></div>
              <select
                className="select select-bordered select-sm w-40"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
              >
                <option value="">All brands</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>

            {/* Filter name filter */}
            {filterNames.length > 0 && (
              <label className="form-control">
                <div className="label py-0"><span className="label-text text-xs">Filter</span></div>
                <select
                  className="select select-bordered select-sm w-40"
                  value={filterFilter}
                  onChange={(e) => setFilterFilter(e.target.value)}
                >
                  <option value="">All filters</option>
                  {filterNames.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Category filter */}
            {availableCategories.length > 0 && (
              <label className="form-control">
                <div className="label py-0"><span className="label-text text-xs">Category</span></div>
                <select
                  className="select select-bordered select-sm w-44"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="">All categories</option>
                  {availableCategories.map((c) => (
                    <option key={c.value} value={c.value}>{c.label} ({c.count})</option>
                  ))}
                </select>
              </label>
            )}

            {/* Sort */}
            <label className="form-control">
              <div className="label py-0"><span className="label-text text-xs">Sort by</span></div>
              <select
                className="select select-bordered select-sm w-44"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
              >
                <option value="newest">Newest first</option>
                <option value="discount-desc">% Off (high → low)</option>
                <option value="discount-asc">% Off (low → high)</option>
                <option value="price-asc">Price (low → high)</option>
                <option value="price-desc">Price (high → low)</option>
              </select>
            </label>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Bulk actions */}
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  className="btn btn-sm btn-outline btn-primary"
                  disabled={isBulkPending}
                  onClick={() => startBulkTransition(async () => { await onMarkAllRead(); })}
                >
                  {isBulkPending ? <span className="loading loading-spinner loading-xs" /> : 'Mark All Read'}
                </button>
              )}
              <button
                className="btn btn-sm btn-outline btn-error"
                disabled={isBulkPending}
                onClick={() => startBulkTransition(async () => { await onDismissAll(); })}
              >
                {isBulkPending ? <span className="loading loading-spinner loading-xs" /> : 'Dismiss All'}
              </button>
            </div>
          </div>

          <div className="text-xs text-base-content/50">
            {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
            {unreadCount > 0 && ` · ${unreadCount} unread`}
          </div>
        </div>
      </div>

      {/* Notification cards */}
      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkAsRead={onMarkAsRead}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      ) : (
        <div className="card bg-base-300 shadow-lg p-8 text-center">
          <p className="text-base-content/60">
            {notifications.length > 0
              ? 'No notifications match the current filters.'
              : 'No notifications yet. Deals matching your filters will appear here.'}
          </p>
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  notification,
  onMarkAsRead,
  onDismiss,
}: {
  notification: NotificationWithDeal;
  onMarkAsRead: (id: string) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
}) {
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
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {!notification.read && (
                <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
              )}
              <h3 className="font-semibold text-sm leading-tight truncate" title={deal.productName}>
                {deal.productName}
              </h3>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {deal.brand && (
                <span className="text-xs text-base-content/50">{deal.brand}</span>
              )}
              {deal.filterName && (
                <span className="badge badge-xs badge-ghost">{deal.filterName}</span>
              )}
            </div>
            <p className="text-xs text-base-content/40 mt-1">{timeAgo}</p>
          </div>

          <span className="text-xl font-bold text-primary shrink-0">
            {discount.toFixed(0)}%
          </span>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-primary">${bestPrice.toFixed(2)}</span>
            <span className="text-sm text-base-content/40 line-through">${listPrice.toFixed(2)}</span>
            <a href={deal.productUrl} target="_blank" rel="noopener noreferrer" className="btn btn-xs btn-ghost text-primary">
              View Deal →
            </a>
          </div>

          <NotificationActions
            notificationId={notification.id}
            isRead={notification.read}
            onMarkAsRead={onMarkAsRead}
            onDismiss={onDismiss}
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
