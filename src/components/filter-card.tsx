'use client';

import { useState } from 'react';
import AddFilterForm from './add-filter-form';
import DeleteFilterButton from './delete-filter-button';

interface FilterData {
  id: string;
  name: string;
  discountThreshold: number;
  maxPrice: string | null;
  keywords: string[] | null;
  excludedCategories: string[] | null;
  active: boolean;
}

export default function FilterCard({ filter }: { filter: FilterData }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <AddFilterForm editFilter={filter} onDone={() => setEditing(false)} />
    );
  }

  return (
    <div className="card bg-base-300 shadow-lg">
      <div className="card-body p-5 gap-3">
        <div className="flex items-start justify-between">
          <h3 className="card-title text-base">{filter.name}</h3>
          <span
            className={`badge badge-sm ${
              filter.active ? 'badge-primary' : 'badge-ghost'
            }`}
          >
            {filter.active ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-base-content/60">Discount</span>
          <span className="text-primary font-medium">
            ≥ {filter.discountThreshold}%
          </span>

          <span className="text-base-content/60">Max Price</span>
          <span>
            {filter.maxPrice ? (
              <span className="text-primary font-medium">
                ${parseFloat(filter.maxPrice).toFixed(2)}
              </span>
            ) : (
              <span className="text-base-content/40">No limit</span>
            )}
          </span>

          <span className="text-base-content/60">Keywords</span>
          <span>
            {filter.keywords && filter.keywords.length > 0 ? (
              <span className="text-base-content/80">
                {filter.keywords.join(', ')}
              </span>
            ) : (
              <span className="text-base-content/40">None</span>
            )}
          </span>

          <span className="text-base-content/60">Excluded</span>
          <span>
            {filter.excludedCategories &&
            filter.excludedCategories.length > 0 ? (
              <span className="text-base-content/80">
                {filter.excludedCategories.join(', ')}
              </span>
            ) : (
              <span className="text-base-content/40">None</span>
            )}
          </span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={() => setEditing(true)}
            className="btn btn-xs btn-ghost"
          >
            Edit
          </button>
          <DeleteFilterButton filterId={filter.id} />
        </div>
      </div>
    </div>
  );
}
