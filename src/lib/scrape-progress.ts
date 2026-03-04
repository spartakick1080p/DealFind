/**
 * In-memory scrape progress tracker — supports multiple concurrent jobs.
 *
 * Uses globalThis to ensure a single shared instance across all Next.js
 * module contexts (server actions, API routes, etc.).
 *
 * Each job is identified by a unique jobId (UUID).
 */

import { randomUUID } from 'crypto';

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

export interface JobInfo {
  jobId: string;
  progress: ScrapeProgress;
  websiteName?: string;
  filterName?: string;
  /** Where the job was triggered from */
  source?: 'manual' | 'scheduled';
  startedAt: number;
}

interface JobStore {
  progress: ScrapeProgress;
  startTime: number;
  uniqueProductIds: Set<string>;
  websiteName?: string;
  filterName?: string;
  source?: 'manual' | 'scheduled';
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

const GLOBAL_KEY = '__scrape_jobs_store__' as const;

function getJobs(): Map<string, JobStore> {
  const g = globalThis as unknown as Record<string, Map<string, JobStore>>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map();
  }
  return g[GLOBAL_KEY];
}

/** Create a new job and return its ID. */
export function createJob(websiteName?: string, filterName?: string, source?: 'manual' | 'scheduled'): string {
  const jobId = randomUUID();
  const jobs = getJobs();
  jobs.set(jobId, {
    progress: { ...DEFAULT_PROGRESS, status: 'running' },
    startTime: Date.now(),
    uniqueProductIds: new Set(),
    websiteName,
    filterName,
    source,
  });
  return jobId;
}

/** Remove a finished job from the store. */
export function removeJob(jobId: string): void {
  getJobs().delete(jobId);
}

/** Get progress for a specific job. */
export function getProgress(jobId: string): ScrapeProgress {
  const store = getJobs().get(jobId);
  if (!store) return { ...DEFAULT_PROGRESS };
  if (store.progress.status === 'running') {
    store.progress.elapsedMs = Date.now() - store.startTime;
    store.progress.uniqueProducts = store.uniqueProductIds.size;
  }
  return { ...store.progress };
}

/** Get info for all active (running) jobs. */
export function getActiveJobs(): JobInfo[] {
  const result: JobInfo[] = [];
  for (const [jobId, store] of getJobs()) {
    if (store.progress.status === 'running') {
      store.progress.elapsedMs = Date.now() - store.startTime;
      store.progress.uniqueProducts = store.uniqueProductIds.size;
      result.push({
        jobId,
        progress: { ...store.progress },
        websiteName: store.websiteName,
        filterName: store.filterName,
        source: store.source,
        startedAt: store.startTime,
      });
    }
  }
  return result;
}

/** Get info for all jobs (including finished). */
export function getAllJobs(): JobInfo[] {
  const result: JobInfo[] = [];
  for (const [jobId, store] of getJobs()) {
    if (store.progress.status === 'running') {
      store.progress.elapsedMs = Date.now() - store.startTime;
      store.progress.uniqueProducts = store.uniqueProductIds.size;
    }
    result.push({
      jobId,
      progress: { ...store.progress },
      websiteName: store.websiteName,
      filterName: store.filterName,
      source: store.source,
      startedAt: store.startTime,
    });
  }
  return result;
}

export function resetProgress(jobId: string): void {
  const store = getJobs().get(jobId);
  if (!store) return;
  store.progress = { ...DEFAULT_PROGRESS, status: 'running' };
  store.startTime = Date.now();
  store.uniqueProductIds = new Set();
}

export function updateProgress(jobId: string, update: Partial<ScrapeProgress>): void {
  const store = getJobs().get(jobId);
  if (!store) return;
  Object.assign(store.progress, update);
  if (store.progress.status === 'running') {
    store.progress.elapsedMs = Date.now() - store.startTime;
  }
}

export function completeProgress(jobId: string, totalProducts: number, newDeals: number): void {
  const store = getJobs().get(jobId);
  if (!store) return;
  store.progress.status = 'done';
  store.progress.totalProducts = totalProducts;
  store.progress.newDeals = newDeals;
  store.progress.uniqueProducts = store.uniqueProductIds.size;
  store.progress.elapsedMs = Date.now() - store.startTime;
}

export function failProgress(jobId: string, message: string): void {
  const store = getJobs().get(jobId);
  if (!store) return;
  store.progress.status = 'error';
  store.progress.errorMessage = message;
  store.progress.elapsedMs = Date.now() - store.startTime;
}

/** Track a product ID for unique product counting. Returns the current unique count. */
export function trackUniqueProduct(jobId: string, productId: string): number {
  const store = getJobs().get(jobId);
  if (!store) return 0;
  store.uniqueProductIds.add(productId);
  return store.uniqueProductIds.size;
}

/** Get the current unique product count without adding anything. */
export function getUniqueProductCount(jobId: string): number {
  return getJobs().get(jobId)?.uniqueProductIds.size ?? 0;
}

/** Request cancellation of a specific scrape job. */
export function cancelScrape(jobId: string): void {
  const store = getJobs().get(jobId);
  if (store && store.progress.status === 'running') {
    store.progress.status = 'cancelled';
    store.progress.elapsedMs = Date.now() - store.startTime;
  }
}

/** Check whether cancellation has been requested for a job. */
export function isCancelled(jobId: string): boolean {
  return getJobs().get(jobId)?.progress.status === 'cancelled';
}

// ---------------------------------------------------------------------------
// Cleanup: auto-remove finished jobs older than 5 minutes
// ---------------------------------------------------------------------------
const FINISHED_TTL_MS = 5 * 60 * 1000;

export function cleanupFinishedJobs(): void {
  const now = Date.now();
  const jobs = getJobs();
  for (const [jobId, store] of jobs) {
    if (
      store.progress.status !== 'running' &&
      now - store.startTime > FINISHED_TTL_MS
    ) {
      jobs.delete(jobId);
    }
  }
}
