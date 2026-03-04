import { NextResponse } from 'next/server';
import { getProgress, cancelScrape, getActiveJobs, cleanupFinishedJobs } from '@/lib/scrape-progress';

// GET /api/scrape-progress?jobId=<id>  — single job progress
// GET /api/scrape-progress              — all active jobs
export async function GET(request: Request) {
  cleanupFinishedJobs();
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (jobId) {
    return NextResponse.json(getProgress(jobId));
  }

  return NextResponse.json(getActiveJobs());
}

// POST /api/scrape-progress  { jobId }  — cancel a specific job
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const jobId = body?.jobId;
    if (jobId) {
      cancelScrape(jobId);
      return NextResponse.json({ cancelled: true, jobId });
    }
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
