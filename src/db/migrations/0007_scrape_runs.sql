CREATE TABLE IF NOT EXISTS "scrape_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "website_id" uuid REFERENCES "monitored_websites"("id") ON DELETE SET NULL,
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
