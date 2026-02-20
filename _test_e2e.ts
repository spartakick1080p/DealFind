/**
 * End-to-end test for the scrape workflow via EventBridge Scheduler.
 *
 * Creates a one-time EventBridge schedule that fires ~2 minutes from now,
 * invoking the deployed Lambda, which calls GET /api/cron/scrape?websiteId=<id>.
 *
 * Usage:
 *   npx tsx _test_e2e.ts <websiteId>
 *   npx tsx _test_e2e.ts              # lists active websites to pick from
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  GetScheduleCommand,
  ResourceNotFoundException,
  type FlexibleTimeWindowMode,
  type ActionAfterCompletion,
} from '@aws-sdk/client-scheduler';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
const SCHEDULER_ROLE_ARN = process.env.SCHEDULER_ROLE_ARN!;
const SCHEDULER_TARGET_ARN = process.env.SCHEDULER_TARGET_ARN!;
const APP_BASE_URL = process.env.APP_BASE_URL!;
const CRON_SECRET = process.env.CRON_SECRET!;
const DATABASE_URL = process.env.DATABASE_URL!;

const SCHEDULE_GROUP = 'deal-monitor';
const TEST_SCHEDULE_NAME = 'e2e-test-scrape';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClient(): SchedulerClient {
  return new SchedulerClient({ region: AWS_REGION });
}

/** Build an `at()` expression ~2 minutes from now */
function getAtExpression(): string {
  const fire = new Date(Date.now() + 2 * 60 * 1000);
  // EventBridge at() format: at(yyyy-MM-ddTHH:mm:ss)
  const iso = fire.toISOString().replace(/\.\d+Z$/, '');
  return `at(${iso})`;
}

async function deleteExistingSchedule(client: SchedulerClient): Promise<void> {
  try {
    await client.send(
      new GetScheduleCommand({ Name: TEST_SCHEDULE_NAME, GroupName: SCHEDULE_GROUP }),
    );
    // exists — delete it
    await client.send(
      new DeleteScheduleCommand({ Name: TEST_SCHEDULE_NAME, GroupName: SCHEDULE_GROUP }),
    );
    console.log('🗑️  Deleted previous test schedule');
  } catch (err) {
    if (err instanceof ResourceNotFoundException) return;
    throw err;
  }
}

async function listActiveWebsites(): Promise<{ id: string; name: string; baseUrl: string }[]> {
  // Dynamic import so we don't pull in drizzle unless needed
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(DATABASE_URL);
  const rows = await sql`SELECT id, name, base_url FROM monitored_websites WHERE active = true ORDER BY name`;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, baseUrl: r.base_url as string }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let websiteId = process.argv[2];

  console.log('='.repeat(60));
  console.log('  Deal Monitor — E2E Test (EventBridge Schedule)');
  console.log('='.repeat(60));

  // If no websiteId provided, list active websites
  if (!websiteId) {
    console.log('\nNo websiteId provided. Fetching active websites...\n');
    const websites = await listActiveWebsites();
    if (websites.length === 0) {
      console.log('❌ No active websites found in the database.');
      process.exit(1);
    }
    console.log('Active websites:');
    for (const w of websites) {
      console.log(`  ${w.id}  ${w.name}  (${w.baseUrl})`);
    }
    // Use the first one
    websiteId = websites[0].id;
    console.log(`\n→ Using first website: ${websites[0].name} (${websiteId})`);
  }

  const client = getClient();
  const atExpr = getAtExpression();

  const payload = JSON.stringify({
    websiteId,
    appBaseUrl: APP_BASE_URL,
    cronSecret: CRON_SECRET,
  });

  console.log(`\n  Schedule:   ${TEST_SCHEDULE_NAME}`);
  console.log(`  Group:      ${SCHEDULE_GROUP}`);
  console.log(`  Expression: ${atExpr}`);
  console.log(`  Lambda ARN: ${SCHEDULER_TARGET_ARN}`);
  console.log(`  Website ID: ${websiteId}`);
  console.log(`  App URL:    ${APP_BASE_URL}`);
  console.log('='.repeat(60));

  // Clean up any previous test schedule
  await deleteExistingSchedule(client);

  // Create the one-time schedule
  console.log('\n📅 Creating one-time EventBridge schedule...');

  await client.send(
    new CreateScheduleCommand({
      Name: TEST_SCHEDULE_NAME,
      GroupName: SCHEDULE_GROUP,
      ScheduleExpression: atExpr,
      ScheduleExpressionTimezone: 'UTC',
      State: 'ENABLED',
      FlexibleTimeWindow: { Mode: 'OFF' as FlexibleTimeWindowMode },
      ActionAfterCompletion: 'DELETE' as ActionAfterCompletion,
      Target: {
        Arn: SCHEDULER_TARGET_ARN,
        RoleArn: SCHEDULER_ROLE_ARN,
        Input: payload,
      },
    }),
  );

  const fireTime = new Date(Date.now() + 2 * 60 * 1000);
  console.log(`\n✅ Schedule created successfully.`);
  console.log(`   It will fire at ~${fireTime.toISOString()} (in ~2 minutes).`);
  console.log(`   The schedule will auto-delete after execution.`);
  console.log(`\n   Full flow:`);
  console.log(`   EventBridge → Lambda (scrape-trigger) → GET /api/cron/scrape?websiteId=${websiteId}`);
  console.log(`\n   Check your app's notifications page or Lambda CloudWatch logs for results.`);
  console.log('\n' + '='.repeat(60));
}

main().catch((err) => {
  console.error('💥 Unhandled error:', err);
  process.exit(1);
});
