'use client';

import { useTransition } from 'react';
import { removeUrl } from '@/app/websites/[id]/actions';

export default function RemoveUrlButton({ urlId }: { urlId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    startTransition(async () => {
      await removeUrl(urlId);
    });
  }

  return (
    <button onClick={handleRemove} disabled={isPending} className="btn btn-xs btn-ghost text-error">
      {isPending ? <span className="loading loading-spinner loading-xs" /> : 'Remove'}
    </button>
  );
}
