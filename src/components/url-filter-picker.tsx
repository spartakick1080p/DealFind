'use client';

import FilterPicker from './filter-picker';
import { setUrlFilters } from '@/app/websites/[id]/filter-actions';

interface FilterOption {
  id: string;
  name: string;
  active: boolean;
}

interface Props {
  urlId: string;
  websiteId: string;
  filters: FilterOption[];
  selectedIds: string[];
}

export default function UrlFilterPicker({ urlId, websiteId, filters, selectedIds }: Props) {
  async function handleSave(filterIds: string[]) {
    const result = await setUrlFilters(urlId, filterIds, websiteId);
    return { success: result.success, error: result.success ? undefined : result.error };
  }

  return (
    <FilterPicker
      filters={filters}
      selectedIds={selectedIds}
      onSave={handleSave}
      label="URL-level filters (overrides website)"
      emptyLabel="Inherit from website"
    />
  );
}
