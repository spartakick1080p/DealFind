'use server';

import { revalidatePath } from 'next/cache';
import { executeScrapeJob, type ScrapeResult } from '@/lib/scraper/scraper';
import { failProgress } from '@/lib/scrape-progress';
import { db } from '@/db';
import { monitoredWebsites, filters } from '@/db/schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Module-level concurrency flag (mirrors the cron route guard).
// ---------------------------------------------------------------------------

let isRunning = false;

// ---------------------------------------------------------------------------
// Manual trigger server action — called from the Settings page UI.
// Bypasses cron auth since it runs server-side within the app.
// ---------------------------------------------------------------------------

export async function triggerScrape(
  websiteId?: string,
  filterId?: string,
): Promise<
  { success: true; result: ScrapeResult } | { success: false; error: string }
> {
  if (isRunning) {
    return { success: false, error: 'A scrape job is already in progress' };
  }

  isRunning = true;

  try {
    const result = await executeScrapeJob(
      undefined, undefined, undefined,
      websiteId || undefined,
      filterId || undefined,
    );
    revalidatePath('/');
    revalidatePath('/notifications');
    return { success: true, result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[settings/triggerScrape] Error:', message);
    failProgress(message);
    return { success: false, error: message };
  } finally {
    isRunning = false;
  }
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
