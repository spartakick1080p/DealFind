'use server';

import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { productPageUrls, monitoredWebsites } from '@/db/schema';
import { parseSchemaJson } from '@/lib/scraper/schema-parser';
import { encrypt, decrypt } from '@/lib/crypto';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export async function addUrl(
  websiteId: string,
  url: string
): Promise<ActionResult<typeof productPageUrls.$inferSelect>> {
  const trimmedUrl = url?.trim();

  if (!trimmedUrl) {
    return { success: false, error: 'URL is required' };
  }

  // Validate URL format
  try {
    new URL(trimmedUrl);
  } catch {
    return { success: false, error: 'Invalid URL format' };
  }

  // Fetch the parent website to get its baseUrl
  const [website] = await db
    .select()
    .from(monitoredWebsites)
    .where(eq(monitoredWebsites.id, websiteId));

  if (!website) {
    return { success: false, error: 'Website not found' };
  }

  // Domain validation
  const productDomain = extractDomain(trimmedUrl);
  const websiteDomain = extractDomain(website.baseUrl);

  if (!productDomain || !websiteDomain) {
    return { success: false, error: 'Unable to extract domain from URL' };
  }

  if (productDomain !== websiteDomain) {
    return {
      success: false,
      error: `URL domain "${productDomain}" does not match website domain "${websiteDomain}"`,
    };
  }

  // Insert the URL, catch unique constraint violations
  try {
    const [inserted] = await db
      .insert(productPageUrls)
      .values({ websiteId, url: trimmedUrl })
      .returning();

    revalidatePath(`/websites/${websiteId}`);
    return { success: true, data: inserted };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('unique')) {
      return {
        success: false,
        error: 'This URL has already been added to this website',
      };
    }
    return { success: false, error: 'Failed to add URL' };
  }
}

export async function removeUrl(
  urlId: string
): Promise<ActionResult> {
  try {
    const [deleted] = await db
      .delete(productPageUrls)
      .where(eq(productPageUrls.id, urlId))
      .returning({ id: productPageUrls.id, websiteId: productPageUrls.websiteId });

    if (!deleted) {
      return { success: false, error: 'URL not found' };
    }

    revalidatePath(`/websites/${deleted.websiteId}`);
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: 'Failed to remove URL' };
  }
}

export async function getUrlsByWebsite(
  websiteId: string
): Promise<ActionResult<(typeof productPageUrls.$inferSelect)[]>> {
  try {
    const urls = await db
      .select()
      .from(productPageUrls)
      .where(eq(productPageUrls.websiteId, websiteId))
      .orderBy(desc(productPageUrls.createdAt));

    return { success: true, data: urls };
  } catch {
    return { success: false, error: 'Failed to fetch URLs' };
  }
}

export async function updateProductSchema(
  websiteId: string,
  schemaJson: string
): Promise<ActionResult> {
  // Validate the JSON
  const result = parseSchemaJson(schemaJson);
  if (!result.valid) {
    return { success: false, error: result.error };
  }

  try {
    const [updated] = await db
      .update(monitoredWebsites)
      .set({ productSchema: schemaJson, updatedAt: new Date() })
      .where(eq(monitoredWebsites.id, websiteId))
      .returning({ id: monitoredWebsites.id });

    if (!updated) {
      return { success: false, error: 'Website not found' };
    }

    revalidatePath(`/websites/${websiteId}`);
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: 'Failed to save schema' };
  }
}

export async function updateAuthToken(
  websiteId: string,
  token: string
): Promise<ActionResult> {
  const trimmed = token?.trim();
  if (!trimmed) {
    // Clear the token
    try {
      await db
        .update(monitoredWebsites)
        .set({ authToken: null, updatedAt: new Date() })
        .where(eq(monitoredWebsites.id, websiteId));
      revalidatePath(`/websites/${websiteId}`);
      return { success: true, data: undefined };
    } catch {
      return { success: false, error: 'Failed to clear auth token' };
    }
  }

  try {
    const encrypted = encrypt(trimmed);
    await db
      .update(monitoredWebsites)
      .set({ authToken: encrypted, updatedAt: new Date() })
      .where(eq(monitoredWebsites.id, websiteId));
    revalidatePath(`/websites/${websiteId}`);
    return { success: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to save auth token';
    return { success: false, error: msg };
  }
}

export async function getAuthTokenPreview(
  websiteId: string
): Promise<ActionResult<{ hasToken: boolean; preview: string }>> {
  try {
    const [website] = await db
      .select({ authToken: monitoredWebsites.authToken })
      .from(monitoredWebsites)
      .where(eq(monitoredWebsites.id, websiteId));

    if (!website?.authToken) {
      return { success: true, data: { hasToken: false, preview: '' } };
    }

    // Decrypt to show a masked preview
    const decrypted = decrypt(website.authToken);
    const preview = decrypted.length > 12
      ? `${decrypted.slice(0, 6)}...${decrypted.slice(-6)}`
      : '••••••';

    return { success: true, data: { hasToken: true, preview } };
  } catch {
    return { success: false, error: 'Failed to read auth token' };
  }
}

/**
 * Decrypt and return the raw auth token for a website.
 * Used internally by the scraper — not exposed to the client.
 */
export async function getDecryptedAuthToken(
  websiteId: string
): Promise<string | null> {
  try {
    const [website] = await db
      .select({ authToken: monitoredWebsites.authToken })
      .from(monitoredWebsites)
      .where(eq(monitoredWebsites.id, websiteId));

    if (!website?.authToken) return null;
    return decrypt(website.authToken);
  } catch {
    return null;
  }
}
