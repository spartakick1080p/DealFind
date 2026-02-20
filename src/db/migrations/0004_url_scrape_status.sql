ALTER TABLE "product_page_urls" ADD COLUMN "last_scrape_status" varchar(16);
ALTER TABLE "product_page_urls" ADD COLUMN "last_scrape_error" text;
ALTER TABLE "product_page_urls" ADD COLUMN "last_scrape_count" integer;
ALTER TABLE "product_page_urls" ADD COLUMN "last_scraped_at" timestamp;
