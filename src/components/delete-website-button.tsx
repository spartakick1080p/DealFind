'use client';

import { useState, useTransition } from 'react';
import { deleteWebsite } from '@/app/websites/actions';

export default function DeleteWebsiteButton({ websiteId }: { websiteId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteWebsite(websiteId);
      setConfirming(false);
    });
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1">
        <button onClick={handleDelete} disabled={isPending} className="btn btn-xs btn-error">
          {isPending ? <span className="loading loading-spinner loading-xs" /> : 'Confirm'}
        </button>
        <button onClick={() => setConfirming(false)} className="btn btn-xs btn-ghost">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className="btn btn-xs btn-ghost text-error">
      Delete
    </button>
  );
}
