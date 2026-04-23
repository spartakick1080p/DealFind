/**
 * Apply multitenancy migration: add user_id columns and assign existing data.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function columnExists(table, column) {
  const r = await sql`SELECT 1 FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`;
  return r.length > 0;
}

async function run() {
  console.log('--- Adding user_id columns ---');
  const tables = ['scrape_runs', 'notifications', 'purchases', 'seen_items'];
  for (const t of tables) {
    if (!(await columnExists(t, 'user_id'))) {
      await sql.query(`ALTER TABLE "${t}" ADD COLUMN "user_id" text REFERENCES "user"("id") ON DELETE CASCADE`);
      console.log(`✓ Added user_id to ${t}`);
    } else {
      console.log(`· ${t}.user_id already exists`);
    }
  }

  // seen_items constraint
  await sql.query(`ALTER TABLE "seen_items" DROP CONSTRAINT IF EXISTS "seen_items_composite_id_unique"`);
  const cExists = await sql`SELECT 1 FROM pg_constraint WHERE conname = 'seen_items_user_composite_unique'`;
  if (cExists.length === 0) {
    await sql.query(`ALTER TABLE "seen_items" ADD CONSTRAINT "seen_items_user_composite_unique" UNIQUE ("user_id", "composite_id")`);
    console.log('✓ Added per-user unique constraint on seen_items');
  } else {
    console.log('· seen_items unique constraint already exists');
  }

  // Clean orphans
  console.log('\n--- Cleaning orphaned rows ---');
  let r = await sql.query(`DELETE FROM "website_filters" WHERE "website_id" NOT IN (SELECT "id" FROM "monitored_websites") RETURNING id`);
  console.log(`✓ Cleaned ${r.length} orphaned website_filters`);
  r = await sql.query(`DELETE FROM "url_filters" WHERE "url_id" NOT IN (SELECT "id" FROM "product_page_urls") RETURNING id`);
  console.log(`✓ Cleaned ${r.length} orphaned url_filters`);

  // Find user
  const users = await sql`SELECT id, name, email FROM "user" ORDER BY "createdAt" ASC LIMIT 5`;
  if (users.length === 0) {
    console.log('\n⚠️  No users found. Sign up first, then re-run: node scripts/apply-multitenancy.mjs');
    return;
  }

  const userId = users[0].id;
  console.log(`\nAssigning data to: ${users[0].name} <${users[0].email}>`);

  // Backfill
  const allTables = ['monitored_websites', 'filters', 'deals', 'scrape_runs', 'notifications', 'purchases', 'seen_items'];
  for (const t of allTables) {
    if (await columnExists(t, 'user_id')) {
      const updated = await sql.query(`UPDATE "${t}" SET "user_id" = $1 WHERE "user_id" IS NULL RETURNING id`, [userId]);
      console.log(`✓ Assigned ${updated.length} ${t} rows`);
    }
  }

  console.log('\n✅ Done.');
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
