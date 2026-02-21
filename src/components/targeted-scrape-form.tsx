'use client';

import { useState } from 'react';
import { triggerScrape } from '@/app/settings/actions';
import ScrapeTriggerButton from './scrape-trigger-button';

interface Option {
  id: string;
  name: string;
}

interface TargetedScrapeFormProps {
  websites: Option[];
  filters: Option[];
}

export default function TargetedScrapeForm({ websites, filters }: TargetedScrapeFormProps) {
  const [websiteId, setWebsiteId] = useState('');
  const [filterId, setFilterId] = useState('');

  async function handleTrigger() {
    return triggerScrape(websiteId || undefined, filterId || undefined);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="form-control">
          <label className="label" htmlFor="website-select">
            <span className="label-text text-base-content/60">Website</span>
          </label>
          <select
            id="website-select"
            className="select select-bordered select-sm w-full"
            value={websiteId}
            onChange={(e) => setWebsiteId(e.target.value)}
          >
            <option value="">All active websites</option>
            {websites.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <div className="form-control">
          <label className="label" htmlFor="filter-select">
            <span className="label-text text-base-content/60">Filter</span>
          </label>
          <select
            id="filter-select"
            className="select select-bordered select-sm w-full"
            value={filterId}
            onChange={(e) => setFilterId(e.target.value)}
          >
            <option value="">All active filters</option>
            {filters.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      </div>

      <ScrapeTriggerButton onTrigger={handleTrigger} />
    </div>
  );
}
