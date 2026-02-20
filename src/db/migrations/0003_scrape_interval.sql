ALTER TABLE "monitored_websites" ADD COLUMN "scrape_interval" varchar(64) NOT NULL DEFAULT '0 8 * * *';
