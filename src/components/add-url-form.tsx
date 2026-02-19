'use client';

import { useState, useTransition } from 'react';
import { addUrl } from '@/app/websites/[id]/actions';

export default function AddUrlForm({ websiteId }: { websiteId: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    startTransition(async () => {
      const result = await addUrl(websiteId, url);
      if (result.success) {
        setUrl('');
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {error && (
        <div className="alert alert-error text-sm py-2">
          <span>{error}</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="form-control flex-1">
          <input
            type="url"
            placeholder="https://example.com/products/page"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="input input-bordered w-full"
            required
          />
        </div>
        <button type="submit" disabled={isPending} className="btn btn-primary">
          {isPending ? <span className="loading loading-spinner loading-sm" /> : 'Add URL'}
        </button>
      </div>
    </form>
  );
}
