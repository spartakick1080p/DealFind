/**
 * AWS EventBridge Scheduler service.
 *
 * Manages per-website scrape schedules. Each active website gets its own
 * EventBridge schedule that invokes a Lambda function. The Lambda makes
 * a GET request to the app's /api/cron/scrape?websiteId=<id> endpoint.
 *
 * Required env vars:
 *   AWS_REGION              — e.g. us-east-1
 *   AWS_ACCESS_KEY_ID       — IAM credentials with scheduler permissions
 *   AWS_SECRET_ACCESS_KEY   — IAM credentials
 *   SCHEDULER_ROLE_ARN      — IAM role ARN for EventBridge Scheduler to assume
 *   SCHEDULER_TARGET_ARN    — ARN of the Lambda function to invoke
 */

import {
  SchedulerClient,
  CreateScheduleCommand,
  UpdateScheduleCommand,
  DeleteScheduleCommand,
  GetScheduleCommand,
  ResourceNotFoundException,
  type FlexibleTimeWindowMode,
  type ScheduleState,
} from '@aws-sdk/client-scheduler';

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------

let client: SchedulerClient | null = null;

function getClient(): SchedulerClient {
  if (!client) {
    client = new SchedulerClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCHEDULE_GROUP = 'deal-monitor';
const SCHEDULE_PREFIX = 'scrape-';

function scheduleName(websiteId: string): string {
  return `${SCHEDULE_PREFIX}${websiteId}`;
}

function isConfigured(): boolean {
  return !!(
    process.env.SCHEDULER_ROLE_ARN &&
    process.env.SCHEDULER_TARGET_ARN
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create or update an EventBridge schedule for a website.
 *
 * The schedule invokes a Lambda with a JSON payload:
 *   { websiteId, appBaseUrl, cronSecret }
 *
 * The Lambda calls GET /api/cron/scrape?websiteId=<id> with the auth header.
 */
export async function upsertSchedule(
  websiteId: string,
  cronExpression: string,
  active: boolean,
): Promise<void> {
  if (!isConfigured()) {
    console.warn('[scheduler] EventBridge not configured — skipping schedule upsert');
    return;
  }

  const name = scheduleName(websiteId);
  const targetArn = process.env.SCHEDULER_TARGET_ARN!;
  const roleArn = process.env.SCHEDULER_ROLE_ARN!;
  const appUrl = (process.env.APP_BASE_URL ?? '').replace(/\/+$/, '');
  const cronSecret = process.env.CRON_SECRET ?? '';

  const scheduleExpression = `cron(${cronToEventBridge(cronExpression)})`;
  const state = (active ? 'ENABLED' : 'DISABLED') as ScheduleState;

  const params = {
    Name: name,
    GroupName: SCHEDULE_GROUP,
    ScheduleExpression: scheduleExpression,
    ScheduleExpressionTimezone: 'UTC',
    State: state,
    FlexibleTimeWindow: { Mode: 'OFF' as FlexibleTimeWindowMode },
    Target: {
      Arn: targetArn,
      RoleArn: roleArn,
      Input: JSON.stringify({
        websiteId,
        appBaseUrl: appUrl,
        cronSecret,
      }),
    },
  };

  try {
    const exists = await scheduleExists(name);
    if (exists) {
      await getClient().send(new UpdateScheduleCommand(params));
    } else {
      await getClient().send(new CreateScheduleCommand(params));
    }
    console.log(`[scheduler] Upserted schedule ${name} (${scheduleExpression}, ${state})`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[scheduler] Failed to upsert schedule ${name}: ${msg}`);
    throw error;
  }
}

/**
 * Delete an EventBridge schedule for a website.
 */
export async function deleteSchedule(websiteId: string): Promise<void> {
  if (!isConfigured()) return;

  const name = scheduleName(websiteId);
  try {
    await getClient().send(
      new DeleteScheduleCommand({ Name: name, GroupName: SCHEDULE_GROUP }),
    );
    console.log(`[scheduler] Deleted schedule ${name}`);
  } catch (error) {
    if (error instanceof ResourceNotFoundException) return;
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[scheduler] Failed to delete schedule ${name}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function scheduleExists(name: string): Promise<boolean> {
  try {
    await getClient().send(
      new GetScheduleCommand({ Name: name, GroupName: SCHEDULE_GROUP }),
    );
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) return false;
    return false;
  }
}

/**
 * Convert a standard 5-field cron expression to EventBridge 6-field format.
 * Standard: "0 8 * * *" (min hour dom month dow)
 * EventBridge: "0 8 * * ? *" (min hour dom month dow year)
 */
function cronToEventBridge(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length === 6) return cron;

  const [min, hour, dom, month, dow] = parts;
  let ebDom = dom;
  let ebDow = dow;
  if (dom === '*' && dow === '*') {
    ebDow = '?';
  } else if (dom !== '*' && dow === '*') {
    ebDow = '?';
  } else if (dom === '*' && dow !== '*') {
    ebDom = '?';
  }

  return `${min} ${hour} ${ebDom} ${month} ${ebDow} *`;
}
