import { db } from '@/db';
import { deals, scrapeRuns } from '@/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scrape-runs/[id]/deals
 * Returns deals found during a specific scrape run, correlated by time range + website.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    // Fetch the scrape run
    const [run] = await db
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.id, id))
      .limit(1);

    if (!run) {
      return NextResponse.json({ error: 'Scrape run not found' }, { status: 404 });
    }

    if (run.newDeals === 0) {
      return NextResponse.json([]);
    }

    // Find deals created during this scrape run's time window
    const conditions = [
      gte(deals.foundAt, run.startedAt),
      lte(deals.foundAt, run.completedAt),
    ];

    // If the run was for a specific website, filter by website name too
    if (run.websiteName && !run.websiteName.includes(',')) {
      conditions.push(eq(deals.websiteName, run.websiteName));
    }

    const runDeals = await db
      .select({
        id: deals.id,
        productName: deals.productName,
        brand: deals.brand,
        listPrice: deals.listPrice,
        bestPrice: deals.bestPrice,
        discountPercentage: deals.discountPercentage,
        imageUrl: deals.imageUrl,
        productUrl: deals.productUrl,
      })
      .from(deals)
      .where(and(...conditions))
      .limit(50);

    return NextResponse.json(runDeals);
  } catch (err) {
    console.error('[api/scrape-runs/deals] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
