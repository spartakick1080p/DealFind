import { NextResponse } from 'next/server';
import { executeScrapeJob } from '@/lib/scraper/scraper';

// ---------------------------------------------------------------------------
// Concurrency guard – simple module-level flag.
// Works for single-instance Vercel serverless deployments.
// ---------------------------------------------------------------------------

let isRunning = false;

// ---------------------------------------------------------------------------
// GET /api/cron/scrape
// Triggered by Vercel Cron or any authenticated caller.
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
    const result = await executeScrapeJob();
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cron/scrape] Unhandled error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    isRunning = false;
  }
}
