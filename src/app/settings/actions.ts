'use server';

import { revalidatePath } from 'next/cache';
import { executeScrapeJob, type ScrapeResult } from '@/lib/scraper/scraper';

// ---------------------------------------------------------------------------
// Module-level concurrency flag (mirrors the cron route guard).
// ---------------------------------------------------------------------------

let isRunning = false;

// ---------------------------------------------------------------------------
// Manual trigger server action — called from the Settings page UI.
// Bypasses cron auth since it runs server-side within the app.
// ---------------------------------------------------------------------------

export async function triggerScrape(): Promise<
  { success: true; result: ScrapeResult } | { success: false; error: string }
> {
  if (isRunning) {
    return { success: false, error: 'A scrape job is already in progress' };
  }

  isRunning = true;

  try {
    const result = await executeScrapeJob();
    revalidatePath('/');
    revalidatePath('/notifications');
    return { success: true, result };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[settings/triggerScrape] Error:', message);
    return { success: false, error: message };
  } finally {
    isRunning = false;
  }
}
