'use client';

import { useState, useTransition } from 'react';
import { deleteFilter } from '@/app/filters/actions';

export default function DeleteFilterButton({ filterId }: { filterId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      await deleteFilter(filterId);
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
