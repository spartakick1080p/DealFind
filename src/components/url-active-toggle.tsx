'use client';

import { useTransition } from 'react';
import { toggleUrlActive } from '@/app/websites/[id]/actions';

interface UrlActiveToggleProps {
  urlId: string;
  active: boolean;
}

export default function UrlActiveToggle({ urlId, active }: UrlActiveToggleProps) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      await toggleUrlActive(urlId, !active);
    });
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0a] disabled:opacity-50 ${
        active ? 'bg-orange-500' : 'bg-gray-600'
      }`}
      role="switch"
      aria-checked={active}
      aria-label={active ? 'Disable URL' : 'Enable URL'}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          active ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}
