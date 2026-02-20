import { NextResponse } from 'next/server';
import { getProgress, cancelScrape } from '@/lib/scrape-progress';

export async function GET() {
  return NextResponse.json(getProgress());
}

export async function POST() {
  cancelScrape();
  return NextResponse.json({ cancelled: true });
}
