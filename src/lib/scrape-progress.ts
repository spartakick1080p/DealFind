/**
 * In-memory scrape progress tracker.
 *
 * Uses globalThis to ensure a single shared instance across all Next.js
 * module contexts (server actions, API routes, etc.).
 */

export interface ScrapeProgress {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  /** Current page being processed (across all URLs) */
  currentPage: number;
  /** Total pages to process (across all URLs) */
  totalPages: number;
  /** Total variants encountered so far */
  totalProducts: number;
  /** Unique products (by productId) encountered so far */
  uniqueProducts: number;
  /** New deals found so far */
  newDeals: number;
  /** Name of the website currently being scraped */
  currentWebsite: string;
  /** Elapsed time in ms */
  elapsedMs: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
}

interface ScrapeProgressStore {
  progress: ScrapeProgress;
  startTime: number;
  uniqueProductIds: Set<string>;
}

const DEFAULT_PROGRESS: ScrapeProgress = {
  status: 'idle',
  currentPage: 0,
  totalPages: 0,
  totalProducts: 0,
  uniqueProducts: 0,
  newDeals: 0,
  currentWebsite: '',
  elapsedMs: 0,
};

const GLOBAL_KEY = '__scrape_progress_store__' as const;

function getStore(): ScrapeProgressStore {
  const g = globalThis as unknown as Record<string, ScrapeProgressStore>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      progress: { ...DEFAULT_PROGRESS },
      startTime: 0,
      uniqueProductIds: new Set(),
    };
  }
  return g[GLOBAL_KEY];
}

export function getProgress(): ScrapeProgress {
  const store = getStore();
  if (store.progress.status === 'running') {
    store.progress.elapsedMs = Date.now() - store.startTime;
    store.progress.uniqueProducts = store.uniqueProductIds.size;
  }
  return { ...store.progress };
}

export function resetProgress(): void {
  const store = getStore();
  store.progress = { ...DEFAULT_PROGRESS, status: 'running' };
  store.startTime = Date.now();
  store.uniqueProductIds = new Set();
}

export function updateProgress(update: Partial<ScrapeProgress>): void {
  const store = getStore();
  Object.assign(store.progress, update);
  if (store.progress.status === 'running') {
    store.progress.elapsedMs = Date.now() - store.startTime;
  }
}

export function completeProgress(totalProducts: number, newDeals: number): void {
  const store = getStore();
  store.progress.status = 'done';
  store.progress.totalProducts = totalProducts;
  store.progress.newDeals = newDeals;
  store.progress.uniqueProducts = store.uniqueProductIds.size;
  store.progress.elapsedMs = Date.now() - store.startTime;
}

export function failProgress(message: string): void {
  const store = getStore();
  store.progress.status = 'error';
  store.progress.errorMessage = message;
  store.progress.elapsedMs = Date.now() - store.startTime;
}

/** Track a product ID for unique product counting. Returns the current unique count. */
export function trackUniqueProduct(productId: string): number {
  const store = getStore();
  store.uniqueProductIds.add(productId);
  return store.uniqueProductIds.size;
}

/** Get the current unique product count without adding anything. */
export function getUniqueProductCount(): number {
  return getStore().uniqueProductIds.size;
}

/** Request cancellation of the current scrape job. */
export function cancelScrape(): void {
  const store = getStore();
  if (store.progress.status === 'running') {
    store.progress.status = 'cancelled';
    store.progress.elapsedMs = Date.now() - store.startTime;
  }
}

/** Check whether cancellation has been requested. */
export function isCancelled(): boolean {
  return getStore().progress.status === 'cancelled';
}
