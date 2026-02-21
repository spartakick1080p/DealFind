/**
 * Webhook delivery service.
 *
 * Dispatches deal notifications to configured third-party services
 * (Discord Bot API, Slack, etc.) when new deals are found during scraping.
 */

import { db } from '@/db';
import { webhooks } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from './crypto';

export interface DealPayload {
  productName: string;
  brand: string | null;
  listPrice: string;
  bestPrice: string;
  discountPercentage: string;
  imageUrl: string | null;
  productUrl: string;
  websiteName?: string;
  /** Price verification result for high-discount deals */
  priceVerification?: 'verified' | 'mismatch' | 'unverified';
  /** The price found on the product detail page (if verified) */
  pdpPrice?: string;
}

// ---------------------------------------------------------------------------
// Service dispatchers
// ---------------------------------------------------------------------------

type Dispatcher = (url: string, deals: DealPayload[], authToken?: string) => Promise<void>;

const dispatchers: Record<string, Dispatcher> = {
  discord: sendDiscord,
  slack: sendSlack,
};

/**
 * Discord Bot API — posts to /channels/{id}/messages with Bot token auth.
 *
 * Batching strategy to avoid rate limits:
 *  - First message: summary text only (no embeds)
 *  - Subsequent messages: up to 5 embeds each (conservative vs Discord's 10 max)
 *  - 2s delay between messages
 *  - Respects 429 Retry-After header and retries once
 *  - Caps at 100 deals per dispatch to avoid extreme cases
 */
async function sendDiscord(channelUrl: string, deals: DealPayload[], botToken?: string): Promise<void> {
  if (!botToken) {
    console.error('[webhook] Discord: missing bot token');
    return;
  }

  const MAX_DEALS = 100;
  const BATCH_SIZE = 5;
  const DELAY_MS = 2000;

  const capped = deals.slice(0, MAX_DEALS);

  // Helper: post a message with rate-limit retry
  async function post(body: Record<string, unknown>): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(channelUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bot ${botToken}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) return true;

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? '5');
        console.warn(`[webhook] Discord rate limited — waiting ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      const text = await res.text().catch(() => '');
      console.error(`[webhook] Discord ${res.status}: ${text}`);
      return false;
    }
    return false;
  }

  // Message 1: summary
  const extra = deals.length > MAX_DEALS ? ` (showing first ${MAX_DEALS})` : '';
  await post({
    content: `🔥 **${deals.length} new deal${deals.length !== 1 ? 's' : ''} found!**${extra}`,
  });

  // Subsequent messages: embed batches
  for (let i = 0; i < capped.length; i += BATCH_SIZE) {
    await new Promise((r) => setTimeout(r, DELAY_MS));

    const batch = capped.slice(i, i + BATCH_SIZE);
    const embeds = batch.map((deal) => {
      const verificationField = deal.priceVerification === 'verified'
        ? { name: 'Price Check', value: '✅ Verified on product page', inline: true }
        : deal.priceVerification === 'mismatch'
        ? { name: '⚠️ Price Mismatch', value: `PDP shows ${deal.pdpPrice ?? 'N/A'}`, inline: true }
        : null;

      return {
        title: deal.productName,
        url: deal.productUrl || undefined,
        color: deal.priceVerification === 'mismatch' ? 0xff9800 : 0x00c853,
        fields: [
          { name: 'Price', value: `~~${deal.listPrice}~~ → **${deal.bestPrice}**`, inline: true },
          { name: 'Discount', value: `${deal.discountPercentage}% off`, inline: true },
          ...(deal.brand ? [{ name: 'Brand', value: deal.brand, inline: true }] : []),
          ...(deal.websiteName ? [{ name: 'Source', value: deal.websiteName, inline: true }] : []),
          ...(verificationField ? [verificationField] : []),
        ],
        thumbnail: deal.imageUrl ? { url: deal.imageUrl } : undefined,
        timestamp: new Date().toISOString(),
      };
    });

    await post({ embeds });
  }
}

async function sendSlack(webhookUrl: string, deals: DealPayload[]): Promise<void> {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `🔥 ${deals.length} new deal${deals.length !== 1 ? 's' : ''} found!` },
    },
    ...deals.slice(0, 20).map((deal) => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${deal.productUrl}|${deal.productName}>*\n~${deal.listPrice}~ → *${deal.bestPrice}* (${deal.discountPercentage}% off)${deal.brand ? ` · ${deal.brand}` : ''}`,
      },
      ...(deal.imageUrl ? { accessory: { type: 'image', image_url: deal.imageUrl, alt_text: deal.productName } } : {}),
    })),
  ];

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[webhook] Slack ${res.status}: ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send deal notifications to all active webhooks for a website.
 */
export async function dispatchWebhooks(
  websiteId: string,
  deals: DealPayload[],
): Promise<void> {
  if (deals.length === 0) return;

  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.websiteId, websiteId));

  const activeHooks = rows.filter((r) => r.active);
  if (activeHooks.length === 0) return;

  for (const hook of activeHooks) {
    const dispatcher = dispatchers[hook.service];
    if (!dispatcher) {
      console.warn(`[webhook] Unknown service: ${hook.service}`);
      continue;
    }

    try {
      const url = decrypt(hook.webhookUrl);
      let authToken: string | undefined;
      if (hook.authToken) {
        try { authToken = decrypt(hook.authToken); } catch { /* no token */ }
      }
      await dispatcher(url, deals, authToken);
      console.log(`[webhook] Sent ${deals.length} deal(s) to ${hook.service}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[webhook] Failed to send to ${hook.service}: ${msg}`);
    }
  }
}
