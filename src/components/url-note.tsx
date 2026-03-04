'use client';

import { useState, useTransition } from 'react';
import { updateUrlNote } from '@/app/websites/[id]/actions';

export default function UrlNote({ urlId, initialNote }: { urlId: string; initialNote: string | null }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(initialNote ?? '');
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateUrlNote(urlId, note);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input input-bordered input-xs w-full max-w-xs"
          placeholder="Add a note..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') { setNote(initialNote ?? ''); setEditing(false); }
          }}
        />
        <button onClick={handleSave} disabled={isPending} className="btn btn-xs btn-ghost text-success">
          {isPending ? <span className="loading loading-spinner loading-xs" /> : '✓'}
        </button>
        <button onClick={() => { setNote(initialNote ?? ''); setEditing(false); }} className="btn btn-xs btn-ghost text-base-content/50">
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-base-content/50 hover:text-base-content cursor-pointer text-left"
    >
      {initialNote || <span className="italic">Add note...</span>}
    </button>
  );
}
