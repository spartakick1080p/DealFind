'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';

interface ScrapeResult {
  totalProductsEncountered: number;
  newDealsFound: number;
  durationMs: number;
  errors: { url: string; message: string }[];
}

type TriggerResponse =
  | { success: true; result: ScrapeResult }
  | { success: false; error: string };

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

interface ScrapeTriggerButtonProps {
  onTrigger: () => Promise<TriggerResponse>;
}

export default function ScrapeTriggerButton({ onTrigger }: ScrapeTriggerButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<TriggerResponse | null>(null);
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll for progress while scrape is running
  useEffect(() => {
    if (!isPending) {
      stopPolling();
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch('/api/scrape-progress');
        if (res.ok) {
          const data: ScrapeProgress = await res.json();
          setProgress(data);
        }
      } catch {
        // ignore fetch errors during polling
      }
    };

    // Start polling immediately, then every 2s
    poll();
    pollRef.current = setInterval(poll, 2000);

    return stopPolling;
  }, [isPending, stopPolling]);

  function handleClick() {
    setResult(null);
    setProgress(null);
    setIsCancelling(false);
    startTransition(async () => {
      const res = await onTrigger();
      // Final progress fetch to capture unique product count
      try {
        const finalProgress = await fetch('/api/scrape-progress');
        if (finalProgress.ok) {
          setProgress(await finalProgress.json());
        }
      } catch { /* ignore */ }
      setResult(res);
    });
  }

  async function handleCancel() {
    setIsCancelling(true);
    try {
      await fetch('/api/scrape-progress', { method: 'POST' });
    } catch { /* ignore */ }
  }

  const pct = progress && progress.totalPages > 0
    ? Math.min(100, Math.round((progress.currentPage / progress.totalPages) * 100))
    : 0;

  const elapsed = progress ? (progress.elapsedMs / 1000).toFixed(0) : '0';

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={handleClick}
          disabled={isPending}
          className="btn btn-primary gap-2"
          aria-label={isPending ? 'Scrape in progress' : 'Run scrape now'}
        >
          {isPending ? (
            <>
              <span className="loading loading-spinner loading-sm" />
              Running Scrape…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Run Scrape Now
            </>
          )}
        </button>

        {isPending && (
          <button
            onClick={handleCancel}
            disabled={isCancelling}
            className="btn btn-error btn-outline gap-2"
            aria-label={isCancelling ? 'Cancelling scrape' : 'Cancel scrape'}
          >
            {isCancelling ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                Cancelling…
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel
              </>
            )}
          </button>
        )}
      </div>

      {/* Progress bar while running */}
      {isPending && (
        <div className="card bg-base-300 shadow-lg">
          <div className="card-body p-4 gap-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-base-content/60">
                {progress?.currentWebsite || 'Starting…'}
              </span>
              <span className="font-mono text-xs text-base-content/50">{elapsed}s</span>
            </div>

            <div className="w-full">
              {progress && progress.totalPages > 0 ? (
                <>
                  <div className="flex justify-between text-xs text-base-content/50 mb-1">
                    <span>Page {progress.currentPage} of {progress.totalPages}</span>
                    <span>{pct}%</span>
                  </div>
                  <progress
                    className="progress progress-primary w-full"
                    value={progress.currentPage}
                    max={progress.totalPages}
                    aria-label={`Scrape progress: ${pct}%`}
                  />
                </>
              ) : (
                <progress className="progress progress-primary w-full" aria-label="Scrape starting" />
              )}
            </div>

            {progress && progress.totalProducts > 0 && (
              <div className="grid grid-cols-2 gap-x-4 text-xs text-base-content/50">
                <span>Unique products</span>
                <span className="font-mono">{(progress.uniqueProducts || 0).toLocaleString()}</span>
                <span>Variants scanned</span>
                <span className="font-mono">{progress.totalProducts.toLocaleString()}</span>
                <span>New deals</span>
                <span className="font-mono">{progress.newDeals}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {result && result.success && progress?.status === 'cancelled' && (
        <div className="alert alert-warning text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Scrape cancelled — {result.result.totalProductsEncountered.toLocaleString()} products scanned, {result.result.newDealsFound} new deals found before stopping.</span>
        </div>
      )}

      {result && result.success && progress?.status !== 'cancelled' && (
        <div className="card bg-base-300 shadow-lg">
          <div className="card-body p-4 gap-2">
            <h3 className="font-semibold text-sm text-primary">Scrape Complete</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-base-content/60">Unique products</span>
              <span className="font-mono">{(progress?.uniqueProducts || 0).toLocaleString()}</span>
              <span className="text-base-content/60">Variants scanned</span>
              <span className="font-mono">{result.result.totalProductsEncountered.toLocaleString()}</span>
              <span className="text-base-content/60">New deals</span>
              <span className="font-mono">{result.result.newDealsFound}</span>
              <span className="text-base-content/60">Duration</span>
              <span className="font-mono">{(result.result.durationMs / 1000).toFixed(1)}s</span>
              <span className="text-base-content/60">Errors</span>
              <span className="font-mono">{result.result.errors.length}</span>
            </div>
            {result.result.errors.length > 0 && (
              <div className="mt-2 text-xs text-error space-y-1">
                {result.result.errors.map((err, i) => (
                  <p key={i} className="truncate" title={err.url}>
                    {err.url}: {err.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {result && !result.success && (
        <div className="alert alert-error text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{result.error}</span>
        </div>
      )}
    </div>
  );
}
