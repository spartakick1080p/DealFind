'use client';

import { useState, useTransition } from 'react';
import { createWebsite } from '@/app/websites/actions';

export default function AddWebsiteForm() {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const result = await createWebsite(name, baseUrl);
      if (result.success) {
        setName('');
        setBaseUrl('');
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card bg-base-300 shadow-lg">
      <div className="card-body p-5 gap-4">
        <h2 className="card-title text-lg">Add Website</h2>
        {error && (
          <div className="alert alert-error text-sm py-2">
            <span>{error}</span>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="form-control flex-1">
            <input
              type="text"
              placeholder="Website name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input input-bordered w-full"
              required
            />
          </div>
          <div className="form-control flex-1">
            <input
              type="url"
              placeholder="https://example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="input input-bordered w-full"
              required
            />
          </div>
          <button type="submit" disabled={isPending} className="btn btn-primary">
            {isPending ? <span className="loading loading-spinner loading-sm" /> : 'Add'}
          </button>
        </div>
      </div>
    </form>
  );
}
