'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface ScrapeProgress {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  currentPage: number;
  totalPages: number;
  totalProducts: number;
  uniqueProducts: number;
  newDeals: number;
  currentWebsite: string;
  elapsedMs: number;
  errorMessage?: string;
}

interface JobInfo {
  jobId: string;
  progress: ScrapeProgress;
  websiteName?: string;
  filterName?: string;
  source?: 'manual' | 'scheduled';
  startedAt: number;
}

export default function ActiveJobs() {
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/scrape-progress');
      if (res.ok) {
        const data: JobInfo[] = await res.json();
        setJobs(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchJobs();
    pollRef.current = setInterval(fetchJobs, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchJobs]);

  async function handleCancel(jobId: string) {
    setCancellingIds((prev) => new Set(prev).add(jobId));
    try {
      await fetch('/api/scrape-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
    } catch { /* ignore */ }
  }

  if (jobs.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-gray-300 mb-3">Active Scrapes</h2>
        <div className="rounded-xl bg-[#0a0a0a] border border-white/10 p-6 text-center">
          <p className="text-gray-500 text-sm">No scrapes currently running.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-300">Active Scrapes</h2>
      {jobs.map((job) => {
        const p = job.progress;
        const pct = p.totalPages > 0 ? Math.min(100, Math.round((p.currentPage / p.totalPages) * 100)) : 0;
        const elapsed = (p.elapsedMs / 1000).toFixed(0);
        const isCancelling = cancellingIds.has(job.jobId);

        return (
          <div key={job.jobId} className="rounded-xl bg-[#0a0a0a] border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="loading loading-spinner loading-sm text-orange-500 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-200 truncate">
                      {job.websiteName || 'All websites'}
                    </p>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      job.source === 'scheduled' ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      {job.source === 'scheduled' ? 'Scheduled' : 'Manual'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-xs text-gray-500">{elapsed}s</span>
                <button
                  onClick={() => handleCancel(job.jobId)}
                  disabled={isCancelling}
                  className="text-xs px-2 py-1 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  aria-label={isCancelling ? 'Cancelling job' : 'Cancel job'}
                >
                  {isCancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>{p.currentWebsite || 'Starting…'}</span>
                {p.totalPages > 0 && <span>Page {p.currentPage}/{p.totalPages} ({pct}%)</span>}
              </div>
              <div className="w-full bg-white/5 rounded-full h-1.5">
                <div
                  className="bg-orange-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${p.totalPages > 0 ? pct : 100}%` }}
                />
              </div>
            </div>

            {p.totalProducts > 0 && (
              <div className="grid grid-cols-3 gap-4 text-xs text-gray-500">
                <div>
                  <span className="block text-gray-600">Products</span>
                  <span className="font-mono text-gray-300">{(p.uniqueProducts || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-gray-600">Variants</span>
                  <span className="font-mono text-gray-300">{p.totalProducts.toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-gray-600">New Deals</span>
                  <span className="font-mono text-orange-400">{p.newDeals}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
