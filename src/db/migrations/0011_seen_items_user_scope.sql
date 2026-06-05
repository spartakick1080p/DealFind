-- Migration: scope seen_items unique constraint to (user_id, composite_id)
-- This fixes the insert conflict error after multi-tenancy was added.

-- Step 1: Add user_id column if it doesn't exist
ALTER TABLE "seen_items" ADD COLUMN IF NOT EXISTS "user_id" text REFERENCES "user"("id") ON DELETE CASCADE;

-- Step 2: Drop the old single-column unique constraint
ALTER TABLE "seen_items" DROP CONSTRAINT IF EXISTS "seen_items_composite_id_unique";

-- Step 3: Create the new composite unique index
CREATE UNIQUE INDEX IF NOT EXISTS "seen_items_user_composite_unique" ON "seen_items" ("user_id", "composite_id");
