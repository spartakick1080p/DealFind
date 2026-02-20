'use client';

import { useState, useTransition } from 'react';
import { createFilter, updateFilter } from '@/app/filters/actions';
import CategorySelect from './category-select';

interface FilterData {
  id: string;
  name: string;
  discountThreshold: number;
  maxPrice: string | null;
  keywords: string[] | null;
  includedCategories: string[] | null;
  excludedCategories: string[] | null;
  active: boolean;
}

export default function AddFilterForm({
  editFilter,
  onDone,
}: {
  editFilter?: FilterData;
  onDone?: () => void;
}) {
  const [name, setName] = useState(editFilter?.name ?? '');
  const [discountThreshold, setDiscountThreshold] = useState(
    editFilter?.discountThreshold?.toString() ?? ''
  );
  const [maxPrice, setMaxPrice] = useState(editFilter?.maxPrice ?? '');
  const [keywords, setKeywords] = useState(
    editFilter?.keywords?.join(', ') ?? ''
  );
  const [includedCategories, setIncludedCategories] = useState<string[]>(
    editFilter?.includedCategories ?? []
  );
  const [excludedCategories, setExcludedCategories] = useState<string[]>(
    editFilter?.excludedCategories ?? []
  );
  const [active, setActive] = useState(editFilter?.active ?? true);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const isEditing = !!editFilter;

  function parseCommaSeparated(value: string): string[] | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const threshold = parseInt(discountThreshold, 10);
    if (isNaN(threshold)) {
      setError('Discount threshold is required');
      return;
    }

    const parsedMaxPrice =
      maxPrice.trim() === '' ? null : parseFloat(maxPrice);
    if (parsedMaxPrice !== null && isNaN(parsedMaxPrice)) {
      setError('Max price must be a valid number');
      return;
    }

    startTransition(async () => {
      const payload = {
        name: name.trim(),
        discountThreshold: threshold,
        maxPrice: parsedMaxPrice,
        keywords: parseCommaSeparated(keywords),
        includedCategories: includedCategories.length > 0 ? includedCategories : null,
        excludedCategories: excludedCategories.length > 0 ? excludedCategories : null,
        active,
      };

      const result = isEditing
        ? await updateFilter(editFilter.id, payload)
        : await createFilter(payload);

      if (result.success) {
        if (!isEditing) {
          setName('');
          setDiscountThreshold('');
          setMaxPrice('');
          setKeywords('');
          setIncludedCategories([]);
          setExcludedCategories([]);
          setActive(true);
        }
        onDone?.();
      } else {
        setError(result.error);
      }
    });
  }

  function handleCancel() {
    onDone?.();
  }

  return (
    <form onSubmit={handleSubmit} className="card bg-base-300 shadow-lg">
      <div className="card-body p-5 gap-4">
        <h2 className="card-title text-lg">
          {isEditing ? 'Edit Filter' : 'Add Filter'}
        </h2>
        {error && (
          <div className="alert alert-error text-sm py-2">
            <span>{error}</span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text">Name</span>
            </label>
            <input
              type="text"
              placeholder="Filter name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input input-bordered w-full"
              required
            />
          </div>
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text">Discount Threshold (%)</span>
            </label>
            <input
              type="number"
              placeholder="1-99"
              min={1}
              max={99}
              value={discountThreshold}
              onChange={(e) => setDiscountThreshold(e.target.value)}
              className="input input-bordered w-full"
              required
            />
          </div>
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text">Max Price ($, optional)</span>
            </label>
            <input
              type="number"
              placeholder="No limit"
              min={0}
              step="0.01"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="input input-bordered w-full"
            />
          </div>
          <div className="form-control">
            <label className="label py-1">
              <span className="label-text">Keywords (comma-separated)</span>
            </label>
            <input
              type="text"
              placeholder="laptop, headphones, monitor"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="input input-bordered w-full"
            />
          </div>
          <CategorySelect
            label="Include Categories (match any)"
            selected={includedCategories}
            onChange={setIncludedCategories}
            placeholder="All categories"
          />
          <CategorySelect
            label="Exclude Categories"
            selected={excludedCategories}
            onChange={setExcludedCategories}
            placeholder="None excluded"
          />
          {isEditing && (
            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-3 py-1">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="toggle toggle-primary"
                />
                <span className="label-text">Active</span>
              </label>
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end">
          {isEditing && (
            <button
              type="button"
              onClick={handleCancel}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="btn btn-primary btn-sm"
          >
            {isPending ? (
              <span className="loading loading-spinner loading-sm" />
            ) : isEditing ? (
              'Save'
            ) : (
              'Add Filter'
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
