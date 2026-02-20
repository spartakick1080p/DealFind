import { getFilters } from './actions';
import AddFilterForm from '@/components/add-filter-form';
import FilterCard from '@/components/filter-card';

export default async function FiltersPage() {
  let filterList: {
    id: string;
    name: string;
    discountThreshold: number;
    maxPrice: string | null;
    keywords: string[] | null;
    includedCategories: string[] | null;
    excludedCategories: string[] | null;
    active: boolean;
  }[] = [];

  try {
    const result = await getFilters();
    if (result.success) {
      filterList = result.data;
    }
  } catch {
    // Graceful fallback
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Deal Filters</h1>

      <AddFilterForm />

      {filterList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filterList.map((filter) => (
            <FilterCard key={filter.id} filter={filter} />
          ))}
        </div>
      ) : (
        <div className="card bg-base-300 shadow-lg p-8 text-center">
          <p className="text-base-content/60">
            No filters configured yet. Add one above to start matching deals.
          </p>
        </div>
      )}
    </div>
  );
}
