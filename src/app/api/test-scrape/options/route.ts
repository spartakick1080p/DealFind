import { NextResponse } from 'next/server';
import { db } from '@/db';
import { monitoredWebsites, filters } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getSession } from '@/lib/auth-server';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ websites: [], filters: [] }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const [websiteRows, filterRows] = await Promise.all([
      db
        .select({
          id: monitoredWebsites.id,
          name: monitoredWebsites.name,
          baseUrl: monitoredWebsites.baseUrl,
        })
        .from(monitoredWebsites)
        .where(eq(monitoredWebsites.userId, userId))
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
        .where(eq(filters.userId, userId))
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
