'use server';

import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { monitoredWebsites } from '@/db/schema';

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
    const [website] = await db
      .insert(monitoredWebsites)
      .values({ name: trimmedName, baseUrl: trimmedUrl })
      .returning();

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
  data: { name?: string; baseUrl?: string; active?: boolean }
): Promise<ActionResult<typeof monitoredWebsites.$inferSelect>> {
  if (data.name !== undefined && !data.name.trim()) {
    return { success: false, error: 'Name cannot be empty' };
  }
  if (data.baseUrl !== undefined && !data.baseUrl.trim()) {
    return { success: false, error: 'Base URL cannot be empty' };
  }

  try {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) updateValues.name = data.name.trim();
    if (data.baseUrl !== undefined) updateValues.baseUrl = data.baseUrl.trim();
    if (data.active !== undefined) updateValues.active = data.active;

    const [website] = await db
      .update(monitoredWebsites)
      .set(updateValues)
      .where(eq(monitoredWebsites.id, id))
      .returning();

    if (!website) {
      return { success: false, error: 'Website not found' };
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
    const [deleted] = await db
      .delete(monitoredWebsites)
      .where(eq(monitoredWebsites.id, id))
      .returning({ id: monitoredWebsites.id });

    if (!deleted) {
      return { success: false, error: 'Website not found' };
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
    const websites = await db
      .select()
      .from(monitoredWebsites)
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
    const [website] = await db
      .select()
      .from(monitoredWebsites)
      .where(eq(monitoredWebsites.id, id));

    return { success: true, data: website ?? null };
  } catch {
    return { success: false, error: 'Failed to fetch website' };
  }
}
