'use client';

import { useState, useTransition } from 'react';
import { updateWebsite } from '@/app/websites/actions';

interface EditWebsiteFormProps {
  website: {
    id: string;
    name: string;
    baseUrl: string;
    active: boolean;
  };
}

export default function EditWebsiteForm({ website }: EditWebsiteFormProps) {
  const [name, setName] = useState(website.name);
  const [baseUrl, setBaseUrl] = useState(website.baseUrl);
  const [active, setActive] = useState(website.active);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    startTransition(async () => {
      const result = await updateWebsite(website.id, { name, baseUrl, active });
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
