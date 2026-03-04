'use client';

import { useState, useTransition } from 'react';

interface ScrapeTriggerButtonProps {
  onTrigger: () => Promise<{ success: true; jobId: string } | { success: false; error: string }>;
}

export default function ScrapeTriggerButton({ onTrigger }: ScrapeTriggerButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const res = await onTrigger();
      if (!res.success) {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="btn btn-primary gap-2"
        aria-label={isPending ? 'Starting scrape…' : 'Run scrape now'}
      >
        {isPending ? (
          <>
            <span className="loading loading-spinner loading-sm" />
            Starting…
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

      {error && (
        <div className="alert alert-error text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
