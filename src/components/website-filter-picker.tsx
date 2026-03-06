'use client';

import FilterPicker from './filter-picker';
import { setWebsiteFilters } from '@/app/websites/[id]/filter-actions';

interface FilterOption {
  id: string;
  name: string;
  active: boolean;
}

interface Props {
  websiteId: string;
  filters: FilterOption[];
  selectedIds: string[];
}

export default function WebsiteFilterPicker({ websiteId, filters, selectedIds }: Props) {
  async function handleSave(filterIds: string[]) {
    const result = await setWebsiteFilters(websiteId, filterIds);
    return { success: result.success, error: result.success ? undefined : result.error };
  }

  return (
    <FilterPicker
      filters={filters}
      selectedIds={selectedIds}
      onSave={handleSave}
      label="Website-level filters"
      emptyLabel="All active filters (default)"
    />
  );
}
