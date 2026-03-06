'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { websiteFilters, urlFilters, filters } from '@/db/schema';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Website-level filter assignments
// ---------------------------------------------------------------------------

export async function getWebsiteFilterIds(
  websiteId: string
): Promise<ActionResult<string[]>> {
  try {
    const rows = await db
      .select({ filterId: websiteFilters.filterId })
      .from(websiteFilters)
      .where(eq(websiteFilters.websiteId, websiteId));

    return { success: true, data: rows.map((r) => r.filterId) };
  } catch {
    return { success: false, error: 'Failed to fetch website filters' };
  }
}

export async function setWebsiteFilters(
  websiteId: string,
  filterIds: string[]
): Promise<ActionResult> {
  try {
    await db.delete(websiteFilters).where(eq(websiteFilters.websiteId, websiteId));

    if (filterIds.length > 0) {
      await db.insert(websiteFilters).values(
        filterIds.map((filterId) => ({ websiteId, filterId }))
      );
    }

    revalidatePath(`/websites/${websiteId}`);
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: 'Failed to update website filters' };
  }
}

// ---------------------------------------------------------------------------
// URL-level filter assignments
// ---------------------------------------------------------------------------

export async function getUrlFilterIds(
  urlId: string
): Promise<ActionResult<string[]>> {
  try {
    const rows = await db
      .select({ filterId: urlFilters.filterId })
      .from(urlFilters)
      .where(eq(urlFilters.urlId, urlId));

    return { success: true, data: rows.map((r) => r.filterId) };
  } catch {
    return { success: false, error: 'Failed to fetch URL filters' };
  }
}

export async function setUrlFilters(
  urlId: string,
  filterIds: string[],
  websiteId: string
): Promise<ActionResult> {
  try {
    await db.delete(urlFilters).where(eq(urlFilters.urlId, urlId));

    if (filterIds.length > 0) {
      await db.insert(urlFilters).values(
        filterIds.map((filterId) => ({ urlId, filterId }))
      );
    }

    revalidatePath(`/websites/${websiteId}`);
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: 'Failed to update URL filters' };
  }
}

// ---------------------------------------------------------------------------
// Shared: fetch all filters for the picker UI
// ---------------------------------------------------------------------------

export async function getAllFilters(): Promise<
  ActionResult<{ id: string; name: string; active: boolean }[]>
> {
  try {
    const allFilters = await db
      .select({ id: filters.id, name: filters.name, active: filters.active })
      .from(filters);

    return { success: true, data: allFilters };
  } catch {
    return { success: false, error: 'Failed to fetch filters' };
  }
}

// ---------------------------------------------------------------------------
// Bulk: fetch URL-level filter assignments for all URLs of a website
// ---------------------------------------------------------------------------

export async function getAllUrlFilterIdsForWebsite(
  websiteId: string,
  urlIds: string[]
): Promise<ActionResult<Record<string, string[]>>> {
  try {
    if (urlIds.length === 0) return { success: true, data: {} };

    // Fetch all url_filters for these URL IDs in one query
    const rows = await db
      .select({ urlId: urlFilters.urlId, filterId: urlFilters.filterId })
      .from(urlFilters);

    // Group by urlId, only include IDs in our set
    const urlIdSet = new Set(urlIds);
    const result: Record<string, string[]> = {};
    for (const row of rows) {
      if (!urlIdSet.has(row.urlId)) continue;
      if (!result[row.urlId]) result[row.urlId] = [];
      result[row.urlId].push(row.filterId);
    }

    return { success: true, data: result };
  } catch {
    return { success: false, error: 'Failed to fetch URL filters' };
  }
}
