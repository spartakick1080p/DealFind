-- Website-level filter assignments (fallback when URLs have no specific filters)
CREATE TABLE IF NOT EXISTS "website_filters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "website_id" uuid NOT NULL REFERENCES "monitored_websites"("id") ON DELETE CASCADE,
  "filter_id" uuid NOT NULL REFERENCES "filters"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_website_filter" ON "website_filters" ("website_id", "filter_id");

-- URL-level filter assignments (most specific, takes priority over website-level)
CREATE TABLE IF NOT EXISTS "url_filters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "url_id" uuid NOT NULL REFERENCES "product_page_urls"("id") ON DELETE CASCADE,
  "filter_id" uuid NOT NULL REFERENCES "filters"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_url_filter" ON "url_filters" ("url_id", "filter_id");
