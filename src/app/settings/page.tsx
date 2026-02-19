import { triggerScrape } from './actions';
import ScrapeTriggerButton from '@/components/scrape-trigger-button';

async function handleTrigger() {
  'use server';
  return triggerScrape();
}

const CONFIG_ITEMS = [
  {
    label: 'Scrape Interval',
    value: 'Every 30 minutes',
    description: 'Configured via Vercel Cron (vercel.json)',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Seen Item TTL',
    value: '7 days',
    description: 'How long before a previously seen deal can re-trigger notifications',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
  },
  {
    label: 'Rate Limit',
    value: '350ms between requests',
    description: 'Minimum delay between HTTP requests to avoid overloading target sites',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    label: 'Max Retries',
    value: '3',
    description: 'Retry count for failed HTTP requests (429, 403, 503)',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    label: 'Request Timeout',
    value: '12s',
    description: 'Maximum time to wait for a single HTTP response',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Max Pagination Pages',
    value: '10',
    description: 'Maximum number of listing pages to follow per product URL',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Scrape Configuration */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-base-content/80">Scrape Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {CONFIG_ITEMS.map((item) => (
            <div key={item.label} className="card bg-base-300 shadow-lg">
              <div className="card-body p-4 gap-1">
                <div className="flex items-center gap-3">
                  <div className="shrink-0">{item.icon}</div>
                  <div className="min-w-0">
                    <p className="text-xs text-base-content/50">{item.label}</p>
                    <p className="text-lg font-bold text-primary">{item.value}</p>
                  </div>
                </div>
                <p className="text-xs text-base-content/40 mt-1">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Manual Scrape Trigger */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-base-content/80">Manual Scrape</h2>
        <div className="card bg-base-300 shadow-lg">
          <div className="card-body p-5">
            <p className="text-sm text-base-content/60 mb-3">
              Trigger a scrape job immediately, bypassing the cron schedule. All active websites and
              their product URLs will be processed.
            </p>
            <ScrapeTriggerButton onTrigger={handleTrigger} />
          </div>
        </div>
      </section>
    </div>
  );
}
