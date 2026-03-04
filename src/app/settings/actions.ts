'use server';

import { revalidatePath } from 'next/cache';
import { executeScrapeJob } from '@/lib/scraper/scraper';
import { createJob, failProgress, getActiveJobs, cancelScrape, removeJob, getProgress, cleanupFinishedJobs, type JobInfo } from '@/lib/scrape-progress';
import { db } from '@/db';
import { monitoredWebsites, filters } from '@/db/schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Manual trigger server action — fire-and-forget.
// Returns a jobId immediately so the client can poll / cancel.
// ---------------------------------------------------------------------------

export async function triggerScrape(
  websiteId?: string,
  filterId?: string,
): Promise<{ success: true; jobId: string } | { success: false; error: string }> {
  // Clean up old finished jobs
  cleanupFinishedJobs();

  // Resolve display names for the job listing
  let websiteName: string | undefined;
  let filterName: string | undefined;

  if (websiteId) {
    const rows = await db
      .select({ name: monitoredWebsites.name })
      .from(monitoredWebsites)
      .where(eq(monitoredWebsites.id, websiteId))
      .limit(1);
    websiteName = rows[0]?.name;
  }

  if (filterId) {
    const rows = await db
      .select({ name: filters.name })
      .from(filters)
      .where(eq(filters.id, filterId))
      .limit(1);
    filterName = rows[0]?.name;
  }

  const jobId = createJob(websiteName, filterName, 'manual');

  // Fire and forget — don't await
  executeScrapeJob(
    undefined, undefined, undefined,
    websiteId || undefined,
    filterId || undefined,
    jobId,
  )
    .then(() => {
      revalidatePath('/');
      revalidatePath('/notifications');
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[settings/triggerScrape] Error:', message);
      failProgress(jobId, message);
    });

  return { success: true, jobId };
}

// ---------------------------------------------------------------------------
// Job management actions
// ---------------------------------------------------------------------------

export async function getRunningJobs(): Promise<JobInfo[]> {
  cleanupFinishedJobs();
  return getActiveJobs();
}

export async function cancelJob(jobId: string): Promise<void> {
  cancelScrape(jobId);
}

export async function getJobProgress(jobId: string) {
  return getProgress(jobId);
}

export async function dismissJob(jobId: string): Promise<void> {
  removeJob(jobId);
}

// ---------------------------------------------------------------------------
// Data loaders for the targeted scrape form dropdowns.
// ---------------------------------------------------------------------------

export async function getActiveWebsites() {
  return db
    .select({ id: monitoredWebsites.id, name: monitoredWebsites.name })
    .from(monitoredWebsites)
    .where(eq(monitoredWebsites.active, true));
}

export async function getActiveFilters() {
  return db
    .select({ id: filters.id, name: filters.name })
    .from(filters)
    .where(eq(filters.active, true));
}
