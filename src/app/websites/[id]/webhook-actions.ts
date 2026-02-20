'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { webhooks } from '@/db/schema';
import { encrypt, decrypt } from '@/lib/crypto';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getWebhooks(
  websiteId: string,
): Promise<ActionResult<{ id: string; service: string; active: boolean; preview: string }[]>> {
  try {
    const rows = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.websiteId, websiteId));

    const result = rows.map((r) => {
      let preview = '••••••';
      try {
        const url = decrypt(r.webhookUrl);
        preview = url.length > 30
          ? `${url.slice(0, 20)}...${url.slice(-10)}`
          : url;
      } catch { /* can't decrypt */ }

      return { id: r.id, service: r.service, active: r.active, preview };
    });

    return { success: true, data: result };
  } catch {
    return { success: false, error: 'Failed to fetch webhooks' };
  }
}

export async function addWebhook(
  websiteId: string,
  service: string,
  webhookUrl: string,
  authToken?: string,
): Promise<ActionResult> {
  const trimmed = webhookUrl?.trim();
  if (!trimmed) return { success: false, error: 'Webhook URL is required' };
  if (!service) return { success: false, error: 'Service is required' };

  // Basic URL validation
  try { new URL(trimmed); } catch {
    return { success: false, error: 'Invalid URL format' };
  }

  try {
    const encryptedUrl = encrypt(trimmed);
    const encryptedToken = authToken?.trim() ? encrypt(authToken.trim()) : null;
    await db.insert(webhooks).values({
      websiteId,
      service,
      webhookUrl: encryptedUrl,
      authToken: encryptedToken,
    });

    revalidatePath(`/websites/${websiteId}`);
    return { success: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to add webhook';
    return { success: false, error: msg };
  }
}

export async function removeWebhook(webhookId: string): Promise<ActionResult> {
  try {
    const [deleted] = await db
      .delete(webhooks)
      .where(eq(webhooks.id, webhookId))
      .returning({ websiteId: webhooks.websiteId });

    if (!deleted) return { success: false, error: 'Webhook not found' };

    revalidatePath(`/websites/${deleted.websiteId}`);
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: 'Failed to remove webhook' };
  }
}

export async function toggleWebhook(webhookId: string, active: boolean): Promise<ActionResult> {
  try {
    const [updated] = await db
      .update(webhooks)
      .set({ active })
      .where(eq(webhooks.id, webhookId))
      .returning({ websiteId: webhooks.websiteId });

    if (!updated) return { success: false, error: 'Webhook not found' };

    revalidatePath(`/websites/${updated.websiteId}`);
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: 'Failed to update webhook' };
  }
}
