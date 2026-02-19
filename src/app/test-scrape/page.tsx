'use client';

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { validateScrapeUrl } from '@/lib/scraper/validate-url';
import type { ProductVariant } from '@/lib/scraper/parser';

interface ScrapeResult {
  variants: ProductVariant[];
  pageType: 'listing' | 'product' | 'unknown';
  count: number;
  schemaUsed?: string;
  baseUrl?: string;
}

interface WebsiteOption {
  id: string;
  name: string;
  baseUrl: string;
}

interface FilterOption {
  id: string;
  name: string;
  discountThreshold: number;
  maxPrice: string | null;
  keywords: string[] | null;
  excludedCategories: string[] | null;
}

export default function TestScrapePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  // Website & filter selection
  const [websites, setWebsites] = useState<WebsiteOption[]>([]);
  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('');
  const [selectedFilterId, setSelectedFilterId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [hideOutOfStock, setHideOutOfStock] = useState(true);

  // Load websites and filters on mount
  useEffect(() => {
    fetch('/api/test-scrape/options')
      .then((r) => r.json())
      .then((data) => {
        setWebsites(data.websites ?? []);
        setFilters(data.filters ?? []);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSelectedCategory('');

    const validation = validateScrapeUrl(url);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/test-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: validation.url,
          websiteId: selectedWebsiteId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }

      setResult(data as ScrapeResult);
    } catch {
      setError('Network error — could not reach the server');
    } finally {
      setLoading(false);
    }
  }

  // Apply filter client-side to the results, sort by discount descending
  const activeFilter = filters.find((f) => f.id === selectedFilterId);
  const filteredVariants = useMemo(() => {
    if (!result) return null;
    let filtered = applyFilter(result.variants, activeFilter);
    // Category filter — match on top-level parent
    if (selectedCategory) {
      const sel = selectedCategory.toLowerCase();
      filtered = filtered.filter((v) =>
        v.categories.some((c) => {
          const parent = c.includes('>') ? c.split('>')[0].trim() : c.trim();
          return parent.toLowerCase() === sel;
        })
      );
    }
    // Hide out of stock
    if (hideOutOfStock) {
      filtered = filtered.filter((v) => v.inStock);
    }
    return [...filtered].sort((a, b) => b.discountPercentage - a.discountPercentage);
  }, [result, activeFilter, selectedCategory, hideOutOfStock]);

  // Build unique category list from all results — collapse to top-level parent only
  const availableCategories = useMemo(() => {
    if (!result) return [];
    const counts = new Map<string, number>();
    for (const v of result.variants) {
      const parents = new Set<string>();
      for (const cat of v.categories) {
        // "Sports & Outdoors > Coolers > Travel Mugs" → "Sports & Outdoors"
        const parent = cat.includes('>') ? cat.split('>')[0].trim() : cat.trim();
        if (parent) parents.add(parent);
      }
      for (const p of parents) {
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [result]);

  // Pagination — 6 cols × 3 rows = 18 per page
  const PAGE_SIZE = 18;
  const [page, setPage] = useState(1);
  const totalPages = filteredVariants ? Math.max(1, Math.ceil(filteredVariants.length / PAGE_SIZE)) : 1;
  const pagedVariants = filteredVariants
    ? filteredVariants.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : null;

  // Reset page when results, filter, or category change
  useEffect(() => { setPage(1); }, [result, selectedFilterId, selectedCategory]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Test Scrape</h1>

      {/* URL Input Form */}
      <form onSubmit={handleSubmit} className="card bg-base-300 shadow-lg">
        <div className="card-body p-5 gap-4">
          <p className="text-sm text-base-content/60">
            Paste a product page URL to run the scraper and view parsed results. Optionally select a website to use its custom schema, and a filter to test against.
          </p>

          {/* Website + Filter + Category selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="form-control w-full">
              <div className="label"><span className="label-text text-xs">Website Schema</span></div>
              <select
                className="select select-bordered select-sm bg-base-200 w-full"
                value={selectedWebsiteId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedWebsiteId(id);
                  const site = websites.find((w) => w.id === id);
                  if (site) setUrl(site.baseUrl);
                }}
                disabled={loading}
              >
                <option value="">Default (auto-detect)</option>
                {websites.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <label className="form-control w-full">
              <div className="label"><span className="label-text text-xs">Test Filter</span></div>
              <select
                className="select select-bordered select-sm bg-base-200 w-full"
                value={selectedFilterId}
                onChange={(e) => setSelectedFilterId(e.target.value)}
                disabled={loading}
              >
                <option value="">No filter (show all)</option>
                {filters.map((f) => (
                  <option key={f.id} value={f.id}>{f.name} (≥{f.discountThreshold}%)</option>
                ))}
              </select>
            </label>
            <label className="form-control w-full">
              <div className="label"><span className="label-text text-xs">Category</span></div>
              <select
                className="select select-bordered select-sm bg-base-200 w-full"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                disabled={loading || availableCategories.length === 0}
              >
                <option value="">All categories</option>
                {availableCategories.map((c) => (
                  <option key={c.name} value={c.name}>{c.name} ({c.count})</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <input
              type="text"
              placeholder="https://example.com/product-page"
              className="input input-bordered flex-1 bg-base-200"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
            />
            <label className="flex items-center gap-2 cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="toggle toggle-sm toggle-primary"
                checked={hideOutOfStock}
                onChange={(e) => setHideOutOfStock(e.target.checked)}
              />
              <span className="label-text text-xs whitespace-nowrap">In stock only</span>
            </label>
            <button
              type="submit"
              className="btn btn-primary min-w-[120px]"
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                'Scrape'
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Error Display */}
      {error && (
        <div role="alert" className="alert alert-error shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {result && filteredVariants && (
        <div className="space-y-4">
          {/* Summary Bar */}
          <div className="card bg-base-300 shadow-lg">
            <div className="card-body p-4 flex-row items-center gap-4 flex-wrap">
              <div className="badge badge-primary badge-lg">
                {result.count} product{result.count !== 1 ? 's' : ''} returned
              </div>
              {activeFilter && (
                <div className="badge badge-warning badge-lg">
                  {filteredVariants.length} matched filter &quot;{activeFilter.name}&quot;
                </div>
              )}
              <div className="badge badge-secondary badge-lg capitalize">{result.pageType} page</div>
              {result.schemaUsed && (
                <div className={`badge badge-lg ${result.schemaUsed.includes('custom') ? 'badge-accent' : 'badge-ghost'}`}>
                  {result.schemaUsed} schema
                </div>
              )}
              {selectedCategory && (
                <div className="badge badge-info badge-lg">
                  Category: {selectedCategory}
                </div>
              )}
            </div>
          </div>

          {/* Empty Results */}
          {filteredVariants.length === 0 && (
            <div className="card bg-base-300 shadow-lg p-8 text-center">
              <p className="text-base-content/60">
                {activeFilter
                  ? 'No variants matched the selected filter.'
                  : 'No products were found on this page.'}
              </p>
            </div>
          )}

          {/* Variant Cards */}
          {pagedVariants && pagedVariants.length > 0 && (
            <>
              <div className="overflow-hidden rounded-lg border border-base-content/10">
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 border-l border-base-content/10">
                  {pagedVariants.map((v, i) => (
                    <ProductCard
                      key={v.compositeId ?? i}
                      variant={v}
                      matchesFilter={activeFilter ? doesVariantMatchFilter(v, activeFilter) : null}
                      baseUrl={result.baseUrl}
                    />
                  ))}
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2">
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-base-content/60">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client-side filter evaluation
// ---------------------------------------------------------------------------

function applyFilter(
  variants: ProductVariant[],
  filter: FilterOption | undefined
): ProductVariant[] {
  if (!filter) return variants;
  return variants.filter((v) => doesVariantMatchFilter(v, filter));
}

function doesVariantMatchFilter(v: ProductVariant, f: FilterOption): boolean {
  // Discount threshold
  if (v.discountPercentage < f.discountThreshold) return false;

  // Max price
  if (f.maxPrice !== null && v.bestPrice > Number(f.maxPrice)) return false;

  // Keywords
  const keywords = f.keywords ?? [];
  if (keywords.length > 0) {
    const nameLower = v.displayName.toLowerCase();
    if (!keywords.some((kw) => nameLower.includes(kw.toLowerCase()))) return false;
  }

  // Excluded categories
  const excluded = f.excludedCategories ?? [];
  if (excluded.length > 0) {
    const excludedLower = excluded.map((c) => c.toLowerCase());
    if (v.categories.some((cat) => excludedLower.includes(cat.toLowerCase()))) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Product Card (Tailwind product list style)
// ---------------------------------------------------------------------------

function resolveProductUrl(productUrl: string, baseUrl?: string): string {
  if (!productUrl) return '';
  if (productUrl.startsWith('http')) return productUrl;
  const base = baseUrl?.replace(/\/+$/, '') ?? '';
  const path = productUrl.startsWith('/') ? productUrl : `/${productUrl}`;
  return base ? `${base}${path}` : productUrl;
}

function ProductCard({
  variant,
  matchesFilter,
  baseUrl,
}: {
  variant: ProductVariant;
  matchesFilter: boolean | null;
  baseUrl?: string;
}) {
  const hasDiscount = variant.discountPercentage > 0;
  const fullProductUrl = resolveProductUrl(variant.productUrl, baseUrl);

  return (
    <div
      className={`group relative border-r border-b border-base-content/10 p-2 sm:p-3 ${
        matchesFilter === true ? 'bg-success/5 ring-1 ring-inset ring-success/30' : ''
      }`}
    >
      {/* Discount badge overlay */}
      {hasDiscount && (
        <div className="absolute top-1 right-1 z-10">
          <span className="badge badge-xs badge-success font-bold">
            -{variant.discountPercentage}%
          </span>
        </div>
      )}

      {/* Stock badge overlay */}
      {!variant.inStock && (
        <div className="absolute top-1 left-1 z-10">
          <span className="badge badge-xs badge-error">OOS</span>
        </div>
      )}

      {/* Product image */}
      {variant.imageUrl ? (
        <img
          alt={variant.displayName}
          src={variant.imageUrl}
          className="aspect-square w-full max-w-[90px] mx-auto rounded-md bg-base-200 object-cover group-hover:opacity-75"
        />
      ) : (
        <div className="aspect-square w-full max-w-[90px] mx-auto rounded-md bg-base-200 flex items-center justify-center">
          <span className="text-base-content/20 text-[10px]">No image</span>
        </div>
      )}

      {/* Product info */}
      <div className="pt-1.5 pb-1 text-center">
        <h3 className="text-[11px] font-medium text-base-content line-clamp-2 leading-tight">
          {fullProductUrl ? (
            <a href={fullProductUrl} target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true" className="absolute inset-0" />
              {variant.displayName}
            </a>
          ) : (
            variant.displayName
          )}
        </h3>

        {variant.description && variant.description !== variant.displayName && (
          <p className="mt-0.5 text-[10px] text-base-content/40 line-clamp-2 leading-tight">
            {variant.description}
          </p>
        )}
        {variant.brand && (
          <p className="mt-0.5 text-[10px] text-base-content/50">{variant.brand}</p>
        )}

        {/* Prices */}
        <div className="mt-1 flex flex-col items-center gap-0">
          <p className="text-xs font-bold text-primary">
            ${variant.bestPrice.toFixed(2)}
          </p>
          {hasDiscount && (
            <p className="text-[10px] text-base-content/40 line-through">
              ${variant.listPrice.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
