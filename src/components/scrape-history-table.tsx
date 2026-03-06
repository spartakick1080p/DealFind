'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useCallback } from 'react';
import { Badge } from './badge';
import {
  Pagination,
  PaginationPrevious,
  PaginationNext,
  PaginationList,
  PaginationPage,
  PaginationGap,
} from './pagination';

interface ScrapeRun {
  id: string;
  websiteId: string | null;
  websiteName: string;
  status: string;
  source: string | null;
  totalProducts: number;
  newDeals: number;
  errorCount: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: Date | string;
  completedAt: Date | string;
}

interface Deal {
  id: string;
  productName: string;
  brand: string | null;
  listPrice: string;
  bestPrice: string;
  discountPercentage: string;
  imageUrl: string | null;
  productUrl: string;
}

const PAGE_SIZE = 10;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = Math.round(secs % 60);
  return `${mins}m ${remainSecs}s`;
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const statusColors: Record<string, string> = {
  completed: 'green',
  error: 'red',
  cancelled: 'yellow',
};

const sourceColors: Record<string, string> = {
  scheduled: 'blue',
  manual: 'orange',
};

export default function ScrapeHistoryTable({ initialHistory }: { initialHistory: ScrapeRun[] }) {
  const router = useRouter();
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dealsMap, setDealsMap] = useState<Record<string, Deal[]>>({});
  const [loadingDeals, setLoadingDeals] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(initialHistory.length / PAGE_SIZE));
  const paged = initialHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Auto-refresh the page every 30s to pick up newly completed scrapes
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      router.refresh();
    }, 30000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [router]);

  const handleRowClick = useCallback(async (run: ScrapeRun) => {
    if (expandedId === run.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(run.id);

    // If we already fetched deals for this run, don't re-fetch
    if (dealsMap[run.id]) return;

    // Only fetch if there are deals to show
    if (run.newDeals > 0) {
      setLoadingDeals(run.id);
      try {
        const res = await fetch(`/api/scrape-runs/${run.id}/deals`);
        if (res.ok) {
          const data: Deal[] = await res.json();
          setDealsMap((prev) => ({ ...prev, [run.id]: data }));
        }
      } catch { /* ignore */ }
      setLoadingDeals(null);
    }
  }, [expandedId, dealsMap]);

  if (initialHistory.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-gray-300 mb-3">Scrape History</h2>
        <div className="rounded-xl bg-[#0a0a0a] border border-white/10 p-6 text-center">
          <p className="text-gray-500 text-sm">No scrape history yet. Run a scrape to see results here.</p>
        </div>
      </section>
    );
  }

  function buildPageNumbers(): (number | 'gap')[] {
    const pages: (number | 'gap')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('gap');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push('gap');
      pages.push(totalPages);
    }
    return pages;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-300 mb-3">Scrape History</h2>
      <div className="rounded-xl bg-[#0a0a0a] border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Website</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Products</th>
                <th className="px-4 py-3 text-right">New Deals</th>
                <th className="px-4 py-3 text-right">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paged.map((run) => (
                <tr
                  key={run.id}
                  className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${expandedId === run.id ? 'bg-white/[0.03]' : ''}`}
                  onClick={() => handleRowClick(run)}
                >
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {formatTime(run.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-200 max-w-[200px] truncate" title={run.websiteName}>
                    {run.websiteName}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={statusColors[run.status] ?? 'gray'}>{run.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={sourceColors[run.source ?? 'manual'] ?? 'orange'}>{run.source ?? 'manual'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    {run.totalProducts.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-orange-400">
                    {run.newDeals}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-400 whitespace-nowrap">
                    {formatDuration(run.durationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expanded detail panel */}
        {expandedId && (() => {
          const run = paged.find((r) => r.id === expandedId);
          if (!run) return null;

          const runDeals = dealsMap[run.id];
          const isLoading = loadingDeals === run.id;
          const hasError = !!run.errorMessage;
          const hasDeals = run.newDeals > 0;

          if (!hasError && !hasDeals) {
            return (
              <div className="border-t border-white/10 px-4 py-4 text-center">
                <p className="text-xs text-gray-500">No deals found and no errors for this scrape.</p>
              </div>
            );
          }

          return (
            <div className="border-t border-white/10">
              {/* Error details */}
              {hasError && (
                <div className="px-4 py-3 bg-red-500/5">
                  <p className="text-xs text-red-400 font-medium mb-1">Error Details</p>
                  <p className="text-xs text-gray-400 whitespace-pre-wrap break-words font-mono">{run.errorMessage}</p>
                </div>
              )}

              {/* Deals list */}
              {hasDeals && (
                <div className="px-4 py-3">
                  <p className="text-xs text-orange-400 font-medium mb-2">
                    Deals Found ({run.newDeals})
                  </p>
                  {isLoading && (
                    <p className="text-xs text-gray-500">Loading deals…</p>
                  )}
                  {runDeals && runDeals.length === 0 && (
                    <p className="text-xs text-gray-500">No deal records found for this time window.</p>
                  )}
                  {runDeals && runDeals.length > 0 && (
                    <div className="grid gap-2">
                      {runDeals.map((deal) => (
                        <a
                          key={deal.id}
                          href={deal.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/5 p-2.5 hover:bg-white/[0.06] transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {deal.imageUrl && (
                            <img
                              src={deal.imageUrl}
                              alt=""
                              className="w-10 h-10 rounded object-cover bg-white/10 flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-gray-200 truncate">{deal.productName}</p>
                            {deal.brand && (
                              <p className="text-[10px] text-gray-500">{deal.brand}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-gray-500 line-through">${deal.listPrice}</p>
                            <p className="text-xs text-green-400 font-medium">${deal.bestPrice}</p>
                          </div>
                          <Badge color="orange" className="flex-shrink-0">
                            -{deal.discountPercentage}%
                          </Badge>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-white/10 px-4 py-3">
            <Pagination>
              <PaginationPrevious
                href={page > 1 ? '#' : undefined}
                onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
              />
              <PaginationList>
                {buildPageNumbers().map((p, i) =>
                  p === 'gap' ? (
                    <PaginationGap key={`gap-${i}`} />
                  ) : (
                    <PaginationPage
                      key={p}
                      current={p === page}
                      href="#"
                      onClick={(e) => { e.preventDefault(); setPage(p); }}
                    >
                      {p}
                    </PaginationPage>
                  ),
                )}
              </PaginationList>
              <PaginationNext
                href={page < totalPages ? '#' : undefined}
                onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
              />
            </Pagination>
          </div>
        )}
      </div>
    </section>
  );
}
