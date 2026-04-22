-- Migration to add multi-tenancy support
-- This script safely migrates existing data to the new schema

-- Step 1: Create auth tables
CREATE TABLE IF NOT EXISTS "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);

CREATE TABLE IF NOT EXISTS "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" uuid NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);

-- Step 2: Create a default user for existing data
-- IMPORTANT: Replace 'your-email@example.com' with your actual email
INSERT INTO "user" (name, email, "emailVerified")
VALUES ('Default User', 'your-email@example.com', false)
ON CONFLICT (email) DO NOTHING;

-- Get the user ID (you'll need this)
-- SELECT id FROM "user" WHERE email = 'your-email@example.com';

-- Step 3: Add user_id columns (nullable first to avoid data loss)
ALTER TABLE "monitored_websites" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "filters" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "user_id" uuid;

-- Step 4: Update existing records with the default user ID
-- IMPORTANT: Replace 'USER_ID_HERE' with the actual UUID from step 2
UPDATE "monitored_websites" SET "user_id" = (SELECT id FROM "user" WHERE email = 'your-email@example.com') WHERE "user_id" IS NULL;
UPDATE "filters" SET "user_id" = (SELECT id FROM "user" WHERE email = 'your-email@example.com') WHERE "user_id" IS NULL;
UPDATE "deals" SET "user_id" = (SELECT id FROM "user" WHERE email = 'your-email@example.com') WHERE "user_id" IS NULL;

-- Step 5: Make user_id NOT NULL
ALTER TABLE "monitored_websites" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "filters" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "deals" ALTER COLUMN "user_id" SET NOT NULL;

-- Step 6: Add other new columns
ALTER TABLE "monitored_websites" ADD COLUMN IF NOT EXISTS "auth_token" text;
ALTER TABLE "monitored_websites" ADD COLUMN IF NOT EXISTS "scrape_interval" varchar(64) DEFAULT '0 8 * * *' NOT NULL;
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "website_name" varchar(255);
ALTER TABLE "filters" ADD COLUMN IF NOT EXISTS "included_categories" text[];
ALTER TABLE "product_page_urls" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL;
ALTER TABLE "product_page_urls" ADD COLUMN IF NOT EXISTS "last_scrape_status" varchar(16);
ALTER TABLE "product_page_urls" ADD COLUMN IF NOT EXISTS "last_scrape_error" text;
ALTER TABLE "product_page_urls" ADD COLUMN IF NOT EXISTS "last_scrape_count" integer;
ALTER TABLE "product_page_urls" ADD COLUMN IF NOT EXISTS "last_scraped_at" timestamp;
ALTER TABLE "product_page_urls" ADD COLUMN IF NOT EXISTS "note" text;

-- Step 7: Drop old unique constraint and add new one
ALTER TABLE "monitored_websites" DROP CONSTRAINT IF EXISTS "monitored_websites_base_url_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "unique_user_base_url" ON "monitored_websites" ("user_id", "base_url");

-- Step 8: Add foreign key constraints
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "deals" ADD CONSTRAINT "deals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "filters" ADD CONSTRAINT "filters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "monitored_websites" ADD CONSTRAINT "monitored_websites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

-- Step 9: Create other missing tables if they don't exist
CREATE TABLE IF NOT EXISTS "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid,
	"website_name" varchar(255) NOT NULL,
	"status" varchar(32) NOT NULL,
	"source" varchar(32),
	"total_products" integer DEFAULT 0 NOT NULL,
	"new_deals" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"service" varchar(64) NOT NULL,
	"webhook_url" text NOT NULL,
	"webhook_auth_token" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "url_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url_id" uuid NOT NULL,
	"filter_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "website_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"filter_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign keys for new tables
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_website_id_monitored_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."monitored_websites"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_website_id_monitored_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."monitored_websites"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "url_filters" ADD CONSTRAINT "url_filters_url_id_product_page_urls_id_fk" FOREIGN KEY ("url_id") REFERENCES "public"."product_page_urls"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "url_filters" ADD CONSTRAINT "url_filters_filter_id_filters_id_fk" FOREIGN KEY ("filter_id") REFERENCES "public"."filters"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "website_filters" ADD CONSTRAINT "website_filters_website_id_monitored_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."monitored_websites"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "website_filters" ADD CONSTRAINT "website_filters_filter_id_filters_id_fk" FOREIGN KEY ("filter_id") REFERENCES "public"."filters"("id") ON DELETE cascade ON UPDATE no action;

-- Add unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "unique_url_filter" ON "url_filters" ("url_id", "filter_id");
CREATE UNIQUE INDEX IF NOT EXISTS "unique_website_filter" ON "website_filters" ("website_id", "filter_id");

-- Done! Now you can log in with the email you specified and access your existing data.
