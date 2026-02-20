/**
 * Local E2E test — emulates what the Lambda does:
 *   GET /api/cron/scrape?websiteId=<id> with Bearer auth
 *
 * Usage:
 *   npx tsx _test_e2e.ts                  # scrape all active websites
 *   npx tsx _test_e2e.ts <websiteId>      # scrape a specific website
 *
 * Requires: local dev server running on http://localhost:3000
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const BASE_URL = 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET!;
const DATABASE_URL = process.env.DATABASE_URL!;

async function listWebsites(): Promise<{ id: string; name: string; baseUrl: string }[]> {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(DATABASE_URL);
  const rows = await sql`SELECT id, name, base_url FROM monitored_websites WHERE active = true ORDER BY name`;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, baseUrl: r.base_url as string }));
}

async function scrape(websiteId?: string) {
  const url = websiteId
    ? `${BASE_URL}/api/cron/scrape?websiteId=${websiteId}`
    : `${BASE_URL}/api/cron/scrape`;

  console.log(`\n🔗 GET ${url}\n`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    console.log(`❌ ${res.status} — response is not JSON (likely an error page):`);
    console.log(text.slice(0, 500));
    return;
  }

  if (!res.ok) {
    console.log(`❌ ${res.status}:`, body);
    return;
  }

  const r = body as {
    totalProductsEncountered: number;
    newDealsFound: number;
    durationMs: number;
    errors: { url: string; message: string }[];
  };

  console.log(`✅ ${res.status} — ${r.totalProductsEncountered} products, ${r.newDealsFound} new deals, ${r.durationMs}ms`);
  if (r.errors.length > 0) {
    console.log(`\n⚠️  ${r.errors.length} error(s):`);
    for (const e of r.errors) console.log(`   ${e.url}\n     → ${e.message}`);
  }
}

async function main() {
  let websiteId = process.argv[2];

  console.log('='.repeat(50));
  console.log('  Local E2E Scrape Test');
  console.log('='.repeat(50));

  if (!websiteId) {
    const sites = await listWebsites();
    if (sites.length === 0) { console.log('No active websites.'); return; }
    console.log('\nActive websites:');
    for (const s of sites) console.log(`  ${s.id}  ${s.name}`);
    websiteId = sites[0].id;
    console.log(`\n→ Using: ${sites[0].name}`);
  }

  await scrape(websiteId);
  console.log('\n' + '='.repeat(50));
}

main().catch((e) => { console.error('💥', e); process.exit(1); });
