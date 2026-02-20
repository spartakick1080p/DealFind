'use client';

import { useState, useRef, useEffect } from 'react';
import { CATEGORIES } from '@/lib/categories';

interface CategorySelectProps {
  label: string;
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export default function CategorySelect({
  label,
  selected,
  onChange,
  placeholder = 'Select categories...',
}: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const selectedLabels = selected
    .map((v) => CATEGORIES.find((c) => c.value === v)?.label)
    .filter(Boolean);

  return (
    <div className="form-control" ref={ref}>
      <label className="label py-1">
        <span className="label-text">{label}</span>
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="input input-bordered w-full text-left flex items-center justify-between"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={selectedLabels.length === 0 ? 'text-base-content/40' : ''}>
            {selectedLabels.length === 0
              ? placeholder
              : selectedLabels.length <= 2
                ? selectedLabels.join(', ')
                : `${selectedLabels.length} selected`}
          </span>
          <svg
            className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <ul
            role="listbox"
            aria-multiselectable="true"
            className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg bg-base-200 shadow-lg border border-base-content/10"
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selected.includes(cat.value);
              return (
                <li
                  key={cat.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(cat.value)}
                  className={`px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-base-300 ${
                    isSelected ? 'bg-primary/10' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    className="checkbox checkbox-primary checkbox-sm"
                    tabIndex={-1}
                  />
                  <span className="text-sm">{cat.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selected.map((v) => {
            const cat = CATEGORIES.find((c) => c.value === v);
            return (
              <span
                key={v}
                className="badge badge-sm badge-primary gap-1"
              >
                {cat?.label ?? v}
                <button
                  type="button"
                  onClick={() => toggle(v)}
                  className="text-primary-content/70 hover:text-primary-content"
                  aria-label={`Remove ${cat?.label ?? v}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
