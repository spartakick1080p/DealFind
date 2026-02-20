import { NextResponse } from 'next/server';
import { executeScrapeJob } from '@/lib/scraper/scraper';

// ---------------------------------------------------------------------------
// Concurrency guard – simple module-level flag.
// Works for single-instance Vercel serverless deployments.
// ---------------------------------------------------------------------------

let isRunning = false;

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

  // --- Concurrency guard ----------------------------------------------------
  if (isRunning) {
    return NextResponse.json(
      { error: 'A scrape job is already in progress' },
      { status: 409 },
    );
  }

  isRunning = true;

  try {
    // Extract optional websiteId from query params or header
    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get('websiteId')
      ?? request.headers.get('x-website-id')
      ?? undefined;

    const result = await executeScrapeJob(undefined, undefined, undefined, websiteId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cron/scrape] Unhandled error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    isRunning = false;
  }
}
