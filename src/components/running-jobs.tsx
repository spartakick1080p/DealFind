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

export default function RunningJobs() {
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
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    pollRef.current = setInterval(fetchJobs, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchJobs]);

  async function handleCancel(jobId: string) {
    setCancellingIds((prev) => new Set(prev).add(jobId));
    try {
      await fetch('/api/scrape-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
    } catch {
      // ignore
    }
  }

  if (jobs.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-base-content/80">Running Jobs</h2>
      <div className="space-y-3">
        {jobs.map((job) => {
          const p = job.progress;
          const pct = p.totalPages > 0
            ? Math.min(100, Math.round((p.currentPage / p.totalPages) * 100))
            : 0;
          const elapsed = (p.elapsedMs / 1000).toFixed(0);
          const isCancelling = cancellingIds.has(job.jobId);
          const label = job.websiteName || 'All websites';
          const sourceLabel = job.source === 'scheduled' ? 'Scheduled' : 'Manual';
          const sourceBadgeClass = job.source === 'scheduled'
            ? 'badge badge-xs badge-info'
            : 'badge badge-xs badge-accent';

          return (
            <div key={job.jobId} className="card bg-base-300 shadow-lg">
              <div className="card-body p-4 gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="loading loading-spinner loading-sm text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{label}</p>
                        <span className={sourceBadgeClass}>{sourceLabel}</span>
                      </div>
                      {job.filterName && (
                        <p className="text-xs text-base-content/50">Filter: {job.filterName}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs text-base-content/50">{elapsed}s</span>
                    <button
                      onClick={() => handleCancel(job.jobId)}
                      disabled={isCancelling}
                      className="btn btn-error btn-outline btn-xs gap-1"
                      aria-label={isCancelling ? 'Cancelling job' : 'Cancel job'}
                    >
                      {isCancelling ? (
                        <>
                          <span className="loading loading-spinner loading-xs" />
                          Cancelling
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Cancel
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="w-full">
                  <div className="flex items-center justify-between text-xs text-base-content/50 mb-1">
                    <span>{p.currentWebsite || 'Starting…'}</span>
                    {p.totalPages > 0 && (
                      <span>Page {p.currentPage}/{p.totalPages} ({pct}%)</span>
                    )}
                  </div>
                  {p.totalPages > 0 ? (
                    <progress
                      className="progress progress-primary w-full"
                      value={p.currentPage}
                      max={p.totalPages}
                      aria-label={`Scrape progress: ${pct}%`}
                    />
                  ) : (
                    <progress className="progress progress-primary w-full" aria-label="Scrape starting" />
                  )}
                </div>

                {p.totalProducts > 0 && (
                  <div className="grid grid-cols-3 gap-x-4 text-xs text-base-content/50">
                    <div>
                      <span className="block">Products</span>
                      <span className="font-mono">{(p.uniqueProducts || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="block">Variants</span>
                      <span className="font-mono">{p.totalProducts.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="block">New deals</span>
                      <span className="font-mono">{p.newDeals}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
