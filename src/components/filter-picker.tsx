'use client';

import { useState, useTransition } from 'react';
import { Badge } from './badge';

interface FilterOption {
  id: string;
  name: string;
  active: boolean;
}

interface FilterPickerProps {
  filters: FilterOption[];
  selectedIds: string[];
  onSave: (filterIds: string[]) => Promise<{ success: boolean; error?: string }>;
  label?: string;
  emptyLabel?: string;
}

export default function FilterPicker({
  filters,
  selectedIds: initialSelectedIds,
  onSave,
  label = 'Filters',
  emptyLabel = 'All active filters (default)',
}: FilterPickerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelectedIds));
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  }

  function handleSave() {
    setError('');
    startTransition(async () => {
      const result = await onSave(Array.from(selectedIds));
      if (!result.success) {
        setError(result.error ?? 'Failed to save');
      } else {
        setDirty(false);
        setIsOpen(false);
      }
    });
  }

  const selectedFilters = filters.filter((f) => selectedIds.has(f.id));
  const activeFilters = filters.filter((f) => f.active);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs text-base-content/60 hover:text-base-content/80 transition-colors"
        aria-label={`${label}: ${selectedFilters.length === 0 ? emptyLabel : selectedFilters.map(f => f.name).join(', ')}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        {selectedFilters.length === 0 ? (
          <span className="italic">{emptyLabel}</span>
        ) : (
          <span className="flex items-center gap-1 flex-wrap">
            {selectedFilters.map((f) => (
              <Badge key={f.id} color={f.active ? 'blue' : 'gray'}>{f.name}</Badge>
            ))}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 rounded-lg bg-base-200 border border-white/10 shadow-xl p-2 space-y-1">
          <p className="text-[10px] text-base-content/40 px-1 mb-1">{label}</p>
          {activeFilters.length === 0 ? (
            <p className="text-xs text-base-content/50 px-1">No filters configured yet.</p>
          ) : (
            activeFilters.map((f) => (
              <label
                key={f.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer text-xs"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(f.id)}
                  onChange={() => toggle(f.id)}
                  className="checkbox checkbox-xs checkbox-primary"
                />
                <span className="text-base-content/80">{f.name}</span>
              </label>
            ))
          )}
          {error && <p className="text-[10px] text-red-400 px-1">{error}</p>}
          <div className="flex items-center justify-between pt-1 border-t border-white/5">
            <button
              type="button"
              onClick={() => { setIsOpen(false); setSelectedIds(new Set(initialSelectedIds)); setDirty(false); }}
              className="text-[10px] text-base-content/40 hover:text-base-content/60 px-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || isPending}
              className="btn btn-xs btn-primary"
            >
              {isPending ? <span className="loading loading-spinner loading-xs" /> : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
