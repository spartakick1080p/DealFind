'use client';

import { useState, useTransition } from 'react';

interface PurchaseButtonProps {
  dealId: string;
  bestPrice: string;
  onPurchase: (dealId: string, actualPrice: number) => Promise<void>;
}

export default function PurchaseButton({ dealId, bestPrice, onPurchase }: PurchaseButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [price, setPrice] = useState(bestPrice);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed < 0) return;

    startTransition(async () => {
      await onPurchase(dealId, parsed);
      setIsOpen(false);
    });
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="btn btn-sm btn-primary btn-outline"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        Mark as Purchased
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        type="number"
        step="0.01"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="input input-sm input-bordered w-24"
        placeholder="Price"
        autoFocus
      />
      <button type="submit" disabled={isPending} className="btn btn-sm btn-primary">
        {isPending ? <span className="loading loading-spinner loading-xs" /> : 'Save'}
      </button>
      <button type="button" onClick={() => setIsOpen(false)} className="btn btn-sm btn-ghost">
        Cancel
      </button>
    </form>
  );
}
