'use server';

import { revalidatePath } from 'next/cache';
import { getActiveJobs, cancelScrape, removeJob, getProgress, cleanupFinishedJobs, type JobInfo } from '@/lib/scrape-progress';
import { db } from '@/db';
import { monitoredWebsites, filters } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth-server';

// ---------------------------------------------------------------------------
// Manual trigger server action.
// Calls the cron API endpoint which runs the scrape synchronously within
// a single serverless function invocation (avoids fire-and-forget issues).
// ---------------------------------------------------------------------------

export async function triggerScrape(
  websiteId?: string,
  filterId?: string,
): Promise<{ success: true; jobId: string } | { success: false; error: string }> {
  const userId = await getUserId();

  // Verify ownership
  if (websiteId) {
    const rows = await db
      .select({ id: monitoredWebsites.id })
      .from(monitoredWebsites)
      .where(and(eq(monitoredWebsites.id, websiteId), eq(monitoredWebsites.userId, userId)))
      .limit(1);
    if (rows.length === 0) return { success: false, error: 'Website not found' };
  }

  if (filterId) {
    const rows = await db
      .select({ id: filters.id })
      .from(filters)
      .where(and(eq(filters.id, filterId), eq(filters.userId, userId)))
      .limit(1);
    if (rows.length === 0) return { success: false, error: 'Filter not found' };
  }

  // Build the cron API URL
  const baseUrl = process.env.BETTER_AUTH_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return { success: false, error: 'CRON_SECRET not configured' };
  }

  const params = new URLSearchParams();
  if (websiteId) params.set('websiteId', websiteId);

  const url = `${baseUrl}/api/cron/scrape${params.toString() ? `?${params}` : ''}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    if (!response.ok) {
      const body = await response.text();
      return { success: false, error: `Scrape failed: ${body}` };
    }

    revalidatePath('/');
    revalidatePath('/notifications');
    revalidatePath('/scrapes');
    return { success: true, jobId: 'manual-' + Date.now() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
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
  const userId = await getUserId();
  return db
    .select({ id: monitoredWebsites.id, name: monitoredWebsites.name })
    .from(monitoredWebsites)
    .where(and(eq(monitoredWebsites.active, true), eq(monitoredWebsites.userId, userId)));
}

export async function getActiveFilters() {
  const userId = await getUserId();
  return db
    .select({ id: filters.id, name: filters.name })
    .from(filters)
    .where(and(eq(filters.active, true), eq(filters.userId, userId)));
}
