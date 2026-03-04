'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

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

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
    cancelled: 'bg-yellow-500/20 text-yellow-400',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${styles[status] ?? 'bg-gray-500/20 text-gray-400'}`}>
      {status}
    </span>
  );
}

export default function ScrapeHistoryTable({ initialHistory }: { initialHistory: ScrapeRun[] }) {
  const router = useRouter();
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh the page every 30s to pick up newly completed scrapes
  useEffect(() => {
    refreshRef.current = setInterval(() => {
      router.refresh();
    }, 30000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [router]);

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
              {initialHistory.map((run) => (
                <tr key={run.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {formatTime(run.startedAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-200 max-w-[200px] truncate" title={run.websiteName}>
                    {run.websiteName}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      run.source === 'scheduled' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      {run.source ?? 'manual'}
                    </span>
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
      </div>
    </section>
  );
}
