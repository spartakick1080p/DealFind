import { db } from '@/db';
import { scrapeRuns } from '@/db/schema';
import { desc } from 'drizzle-orm';
import ActiveJobs from '@/components/active-jobs';
import ScrapeHistoryTable from '@/components/scrape-history-table';

export const dynamic = 'force-dynamic';

export default async function ScrapesPage() {
  let history: (typeof scrapeRuns.$inferSelect)[] = [];

  try {
    history = await db
      .select()
      .from(scrapeRuns)
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
