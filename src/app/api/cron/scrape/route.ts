import { NextResponse } from 'next/server';
import { executeScrapeJob } from '@/lib/scraper/scraper';
import { createJob } from '@/lib/scrape-progress';
import { db } from '@/db';
import { monitoredWebsites } from '@/db/schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// GET /api/cron/scrape
// GET /api/cron/scrape?websiteId=<uuid>
//
// Triggered by EventBridge Scheduler (per-website) or manually.
// When websiteId is provided, only that website is scraped.
// When omitted, all active websites are scraped (legacy/fallback).
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  // --- Auth check -----------------------------------------------------------
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Extract optional websiteId from query params or header
    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get('websiteId')
      ?? request.headers.get('x-website-id')
      ?? undefined;

    // Resolve website name and owner for display
    let websiteName: string | undefined;
    let websiteUserId: string | undefined;
    if (websiteId) {
      const rows = await db
        .select({ name: monitoredWebsites.name, userId: monitoredWebsites.userId })
        .from(monitoredWebsites)
        .where(eq(monitoredWebsites.id, websiteId))
        .limit(1);
      websiteName = rows[0]?.name;
      websiteUserId = rows[0]?.userId;
    }

    const jobId = createJob(websiteName, undefined, 'scheduled');
    const result = await executeScrapeJob(undefined, undefined, undefined, websiteId, undefined, jobId, websiteUserId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cron/scrape] Unhandled error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
