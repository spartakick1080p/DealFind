'use client';

import { useState, useTransition } from 'react';

interface ScrapeResult {
  totalProductsEncountered: number;
  newDealsFound: number;
  durationMs: number;
  errors: { url: string; message: string }[];
}

type TriggerResponse =
  | { success: true; result: ScrapeResult }
  | { success: false; error: string };

interface ScrapeTriggerButtonProps {
  onTrigger: () => Promise<TriggerResponse>;
}

export default function ScrapeTriggerButton({ onTrigger }: ScrapeTriggerButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<TriggerResponse | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await onTrigger();
      setResult(res);
    });
  }

  return (
    <div className="space-y-4">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="btn btn-primary gap-2"
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

      {result && result.success && (
        <div className="card bg-base-300 shadow-lg">
          <div className="card-body p-4 gap-2">
            <h3 className="font-semibold text-sm text-primary">Scrape Complete</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-base-content/60">Products found</span>
              <span className="font-mono">{result.result.totalProductsEncountered}</span>
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
