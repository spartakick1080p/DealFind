'use server';

import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { filters } from '@/db/schema';

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

function validateDiscountThreshold(value: number): string | null {
  if (!Number.isInteger(value)) {
    return 'Discount threshold must be an integer';
  }
  if (value < 1 || value > 99) {
    return 'Discount threshold must be between 1 and 99';
  }
  return null;
}

function validateMaxPrice(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value < 0) {
    return 'Max price must be zero or greater';
  }
  return null;
}

export async function createFilter(data: {
  name: string;
  discountThreshold: number;
  maxPrice?: number | null;
  keywords?: string[] | null;
  includedCategories?: string[] | null;
  excludedCategories?: string[] | null;
}): Promise<ActionResult<typeof filters.$inferSelect>> {
  const trimmedName = data.name?.trim();

  if (!trimmedName) {
    return { success: false, error: 'Name is required' };
  }

  const thresholdError = validateDiscountThreshold(data.discountThreshold);
  if (thresholdError) {
    return { success: false, error: thresholdError };
  }

  const maxPriceError = validateMaxPrice(data.maxPrice);
  if (maxPriceError) {
    return { success: false, error: maxPriceError };
  }

  try {
    const [filter] = await db
      .insert(filters)
      .values({
        name: trimmedName,
        discountThreshold: data.discountThreshold,
        maxPrice: data.maxPrice != null ? String(data.maxPrice) : null,
        keywords: data.keywords ?? null,
        includedCategories: data.includedCategories ?? null,
        excludedCategories: data.excludedCategories ?? null,
      })
      .returning();

    revalidatePath('/filters');
    return { success: true, data: filter };
  } catch (err) {
    console.error('[createFilter] DB error:', err);
    const message = err instanceof Error ? err.message : 'Failed to create filter';
    return { success: false, error: message };
  }
}

export async function updateFilter(
  id: string,
  data: {
    name?: string;
    discountThreshold?: number;
    maxPrice?: number | null;
    keywords?: string[] | null;
    includedCategories?: string[] | null;
    excludedCategories?: string[] | null;
    active?: boolean;
  }
): Promise<ActionResult<typeof filters.$inferSelect>> {
  if (data.name !== undefined && !data.name.trim()) {
    return { success: false, error: 'Name cannot be empty' };
  }

  if (data.discountThreshold !== undefined) {
    const thresholdError = validateDiscountThreshold(data.discountThreshold);
    if (thresholdError) {
      return { success: false, error: thresholdError };
    }
  }

  if (data.maxPrice !== undefined) {
    const maxPriceError = validateMaxPrice(data.maxPrice);
    if (maxPriceError) {
      return { success: false, error: maxPriceError };
    }
  }

  try {
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) updateValues.name = data.name.trim();
    if (data.discountThreshold !== undefined) updateValues.discountThreshold = data.discountThreshold;
    if (data.maxPrice !== undefined) updateValues.maxPrice = data.maxPrice != null ? String(data.maxPrice) : null;
    if (data.keywords !== undefined) updateValues.keywords = data.keywords;
    if (data.includedCategories !== undefined) updateValues.includedCategories = data.includedCategories;
    if (data.excludedCategories !== undefined) updateValues.excludedCategories = data.excludedCategories;
    if (data.active !== undefined) updateValues.active = data.active;

    const [filter] = await db
      .update(filters)
      .set(updateValues)
      .where(eq(filters.id, id))
      .returning();

    if (!filter) {
      return { success: false, error: 'Filter not found' };
    }

    revalidatePath('/filters');
    return { success: true, data: filter };
  } catch {
    return { success: false, error: 'Failed to update filter' };
  }
}

export async function deleteFilter(
  id: string
): Promise<ActionResult> {
  try {
    const [deleted] = await db
      .delete(filters)
      .where(eq(filters.id, id))
      .returning({ id: filters.id });

    if (!deleted) {
      return { success: false, error: 'Filter not found' };
    }

    revalidatePath('/filters');
    return { success: true, data: undefined };
  } catch {
    return { success: false, error: 'Failed to delete filter' };
  }
}

export async function getFilters(): Promise<
  ActionResult<(typeof filters.$inferSelect)[]>
> {
  try {
    const allFilters = await db
      .select()
      .from(filters)
      .orderBy(desc(filters.createdAt));

    return { success: true, data: allFilters };
  } catch {
    return { success: false, error: 'Failed to fetch filters' };
  }
}

export async function getFilterById(
  id: string
): Promise<ActionResult<typeof filters.$inferSelect | null>> {
  try {
    const [filter] = await db
      .select()
      .from(filters)
      .where(eq(filters.id, id));

    return { success: true, data: filter ?? null };
  } catch {
    return { success: false, error: 'Failed to fetch filter' };
  }
}
