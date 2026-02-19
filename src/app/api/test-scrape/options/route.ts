import { NextResponse } from 'next/server';
import { db } from '@/db';
import { monitoredWebsites, filters } from '@/db/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const [websiteRows, filterRows] = await Promise.all([
      db
        .select({
          id: monitoredWebsites.id,
          name: monitoredWebsites.name,
          baseUrl: monitoredWebsites.baseUrl,
        })
        .from(monitoredWebsites)
        .orderBy(desc(monitoredWebsites.createdAt)),
      db
        .select({
          id: filters.id,
          name: filters.name,
          discountThreshold: filters.discountThreshold,
          maxPrice: filters.maxPrice,
          keywords: filters.keywords,
          excludedCategories: filters.excludedCategories,
        })
        .from(filters)
        .orderBy(desc(filters.createdAt)),
    ]);

    return NextResponse.json({
      websites: websiteRows,
      filters: filterRows,
    });
  } catch {
    return NextResponse.json({ websites: [], filters: [] });
  }
}
