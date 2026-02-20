/**
 * Lambda function invoked by EventBridge Scheduler.
 *
 * Receives: { websiteId, appBaseUrl, cronSecret }
 * Calls:    GET <appBaseUrl>/api/cron/scrape?websiteId=<websiteId>
 */
export async function handler(event) {
  const { websiteId, appBaseUrl, cronSecret } = event;

  if (!websiteId || !appBaseUrl || !cronSecret) {
    console.error('Missing required fields:', JSON.stringify(event));
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const url = `${appBaseUrl}/api/cron/scrape?websiteId=${websiteId}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
    });

    const body = await response.text();
    console.log(`[scrape-trigger] ${response.status} websiteId=${websiteId}: ${body}`);
    return { statusCode: response.status, body };
  } catch (error) {
    console.error(`[scrape-trigger] Error: ${error.message}`);
    return { statusCode: 500, body: error.message };
  }
}
