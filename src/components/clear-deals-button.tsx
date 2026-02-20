'use client';

import { useTransition } from 'react';
import { Button } from '@/components/button';

export default function ClearDealsButton({ onClear }: { onClear: () => Promise<void> }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="danger"
      size="sm"
      disabled={isPending}
      onClick={() => {
        if (confirm('Clear all recent deals? This cannot be undone.')) {
          startTransition(() => onClear());
        }
      }}
    >
      {isPending ? 'Clearing…' : 'Clear Deals'}
    </Button>
  );
}
