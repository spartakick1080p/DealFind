import { NextResponse } from 'next/server';
import { db } from '@/db';
import { verification } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  const results: Record<string, unknown> = {};
  
  // Test 1: Basic connection
  try {
    const r = await db.execute(sql`SELECT 1 as ok`);
    results.connection = 'ok';
  } catch (err) {
    results.connection = err instanceof Error ? err.message : String(err);
  }

  // Test 2: Insert into verification
  try {
    await db.insert(verification).values({
      id: 'debug-test-' + Date.now(),
      identifier: 'debug',
      value: 'test',
      expiresAt: new Date(Date.now() + 60000),
    });
    results.insert = 'ok';
  } catch (err) {
    results.insert = err instanceof Error ? err.message : String(err);
  }

  // Test 3: Read back
  try {
    const rows = await db.execute(sql`SELECT count(*) as cnt FROM verification`);
    results.count = rows;
  } catch (err) {
    results.count = err instanceof Error ? err.message : String(err);
  }

  // Cleanup
  try {
    await db.execute(sql`DELETE FROM verification WHERE identifier = 'debug'`);
  } catch {}

  results.env = {
    hasDbUrl: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL?.slice(0, 30) + '...',
    hasBetterAuthUrl: !!process.env.BETTER_AUTH_URL,
    betterAuthUrl: process.env.BETTER_AUTH_URL,
    hasSecret: !!process.env.BETTER_AUTH_SECRET,
  };

  return NextResponse.json(results);
}
