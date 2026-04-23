import { db } from '@/db';
import { scrapeRuns } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth-server';
import ActiveJobs from '@/components/active-jobs';
import ScrapeHistoryTable from '@/components/scrape-history-table';

export const dynamic = 'force-dynamic';

export default async function ScrapesPage() {
  const userId = await getUserId();
  let history: (typeof scrapeRuns.$inferSelect)[] = [];

  try {
    history = await db
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.userId, userId))
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(100);
  } catch {
    // DB may not have the table yet
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-100">Scrapes</h1>
      <ActiveJobs />
      <ScrapeHistoryTable initialHistory={history} />
    </div>
  );
}
