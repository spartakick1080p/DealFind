'use server';

import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { monitoredWebsites } from '@/db/schema';
import { upsertSchedule, deleteSchedule } from '@/lib/scheduler';
import { getUserId } from '@/lib/auth-server';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function createWebsite(
  name: string,
  baseUrl: string
): Promise<ActionResult<typeof monitoredWebsites.$inferSelect>> {
  const trimmedName = name?.trim();
  const trimmedUrl = baseUrl?.trim();

  if (!trimmedName) {
    return { success: false, error: 'Name is required' };
  }
  if (!trimmedUrl) {
    return { success: false, error: 'Base URL is required' };
  }

  try {
    const userId = await getUserId();
    const [website] = await db
      .insert(monitoredWebsites)
      .values({ userId, name: trimmedName, baseUrl: trimmedUrl })
      .returning();

    // Sync EventBridge schedule
    try {
      await upsertSchedule(website.id, website.scrapeInterval, website.active);
    } catch {
      // Non-fatal — schedule can be synced later
    }

    revalidatePath('/websites');
    return { success: true, data: website };
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('unique') 
    ) {
      return {
        success: false,
        error: 'A website with this base URL already exists',
      };
    }
    return { success: false, error: 'Failed to create website' };
  }
}

export async function updateWebsite(
  id: string,
  data: { name?: string; baseUrl?: string; active?: boolean; scrapeInterval?: string }
): Promise<ActionResult<typeof monitoredWebsites.$inferSelect>> {
  if (data.name !== undefined && !data.name.trim()) {
    return { success: false, error: 'Name cannot be empty' };
  }
  if (data.baseUrl !== undefined && !data.baseUrl.trim()) {
    return { success: false, error: 'Base URL cannot be empty' };
  }

  try {
    const userId = await getUserId();
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) updateValues.name = data.name.trim();
    if (data.baseUrl !== undefined) updateValues.baseUrl = data.baseUrl.trim();
    if (data.active !== undefined) updateValues.active = data.active;
    if (data.scrapeInterval !== undefined) updateValues.scrapeInterval = data.scrapeInterval.trim();

    const [website] = await db
      .update(monitoredWebsites)
      .set(updateValues)
      .where(and(eq(monitoredWebsites.id, id), eq(monitoredWebsites.userId, userId)))
      .returning();

    if (!website) {
      return { success: false, error: 'Website not found' };
    }

    // Sync EventBridge schedule
    try {
      await upsertSchedule(website.id, website.scrapeInterval, website.active);
    } catch {
      // Non-fatal
    }

    revalidatePath('/websites');
    return { success: true, data: website };
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message.includes('unique')
    ) {
      return {
        success: false,
        error: 'A website with this base URL already exists',
      };
    }
    return { success: false, error: 'Failed to update website' };
  }
}

export async function deleteWebsite(
  id: string
): Promise<ActionResult> {
  try {
    const userId = await getUserId();
    const [deleted] = await db
      .delete(monitoredWebsites)
      .where(and(eq(monitoredWebsites.id, id), eq(monitoredWebsites.userId, userId)))
      .returning({ id: monitoredWebsites.id });

    if (!deleted) {
      return { success: false, error: 'Website not found' };
    }

    // Clean up EventBridge schedule
    try {
      await deleteSchedule(deleted.id);
    } catch {
      // Non-fatal
    }

    revalidatePath('/websites');
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: 'Failed to delete website' };
  }
}

export async function getWebsites(): Promise<
  ActionResult<(typeof monitoredWebsites.$inferSelect)[]>
> {
  try {
    const userId = await getUserId();
    const websites = await db
      .select()
      .from(monitoredWebsites)
      .where(eq(monitoredWebsites.userId, userId))
      .orderBy(desc(monitoredWebsites.createdAt));

    return { success: true, data: websites };
  } catch {
    return { success: false, error: 'Failed to fetch websites' };
  }
}

export async function getWebsiteById(
  id: string
): Promise<ActionResult<typeof monitoredWebsites.$inferSelect | null>> {
  try {
    const userId = await getUserId();
    const [website] = await db
      .select()
      .from(monitoredWebsites)
      .where(and(eq(monitoredWebsites.id, id), eq(monitoredWebsites.userId, userId)));

    return { success: true, data: website ?? null };
  } catch {
    return { success: false, error: 'Failed to fetch website' };
  }
}
