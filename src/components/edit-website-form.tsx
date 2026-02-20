'use client';

import { useState, useTransition } from 'react';
import { updateWebsite } from '@/app/websites/actions';

interface EditWebsiteFormProps {
  website: {
    id: string;
    name: string;
    baseUrl: string;
    active: boolean;
    scrapeInterval: string;
  };
}

const INTERVAL_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Once daily (8am UTC)', value: '0 8 * * *' },
  { label: 'Twice daily (8am/8pm UTC)', value: '0 8,20 * * *' },
  { label: 'Weekly (Monday 8am UTC)', value: '0 8 * * 1' },
];

export default function EditWebsiteForm({ website }: EditWebsiteFormProps) {
  const [name, setName] = useState(website.name);
  const [baseUrl, setBaseUrl] = useState(website.baseUrl);
  const [active, setActive] = useState(website.active);
  const [scrapeInterval, setScrapeInterval] = useState(website.scrapeInterval);
  const [customCron, setCustomCron] = useState(
    INTERVAL_PRESETS.some((p) => p.value === website.scrapeInterval) ? '' : website.scrapeInterval
  );
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    startTransition(async () => {
      const result = await updateWebsite(website.id, { name, baseUrl, active, scrapeInterval });
      if (result.success) {
        setSuccess('Website updated');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card bg-base-300 shadow-lg">
      <div className="card-body p-5 gap-4">
        <h2 className="card-title text-lg">Edit Website</h2>
        {error && (
          <div className="alert alert-error text-sm py-2">
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="alert alert-success text-sm py-2">
            <span>{success}</span>
          </div>
        )}
        <div className="form-control">
          <label className="label"><span className="label-text">Name</span></label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input input-bordered w-full"
            required
          />
        </div>
        <div className="form-control">
          <label className="label"><span className="label-text">Base URL</span></label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="input input-bordered w-full"
            required
          />
        </div>
        <div className="form-control">
          <label className="label"><span className="label-text">Scrape Interval</span></label>
          <select
            className="select select-bordered w-full"
            value={INTERVAL_PRESETS.some((p) => p.value === scrapeInterval) ? scrapeInterval : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setCustomCron(scrapeInterval);
              } else {
                setScrapeInterval(e.target.value);
                setCustomCron('');
              }
            }}
          >
            {INTERVAL_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
            <option value="custom">Custom cron...</option>
          </select>
          {(!INTERVAL_PRESETS.some((p) => p.value === scrapeInterval) || customCron) && (
            <input
              type="text"
              placeholder="e.g. 0 */4 * * *"
              value={customCron}
              onChange={(e) => {
                setCustomCron(e.target.value);
                setScrapeInterval(e.target.value);
              }}
              className="input input-bordered w-full mt-2"
            />
          )}
          <label className="label">
            <span className="label-text-alt text-base-content/40">
              Standard 5-field cron: min hour dom month dow
            </span>
          </label>
        </div>
        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="toggle toggle-primary"
            />
            <span className="label-text">Active</span>
          </label>
        </div>
        <div className="card-actions justify-end">
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? <span className="loading loading-spinner loading-sm" /> : 'Save Changes'}
          </button>
        </div>
      </div>
    </form>
  );
}
