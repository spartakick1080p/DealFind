CREATE TABLE "account" (
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
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
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
--> statement-breakpoint
CREATE TABLE "session" (
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
--> statement-breakpoint
CREATE TABLE "url_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url_id" uuid NOT NULL,
	"filter_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"service" varchar(64) NOT NULL,
	"webhook_url" text NOT NULL,
	"webhook_auth_token" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"filter_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitored_websites" DROP CONSTRAINT "monitored_websites_base_url_unique";--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "website_name" varchar(255);--> statement-breakpoint
ALTER TABLE "filters" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "filters" ADD COLUMN "included_categories" text[];--> statement-breakpoint
ALTER TABLE "monitored_websites" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "monitored_websites" ADD COLUMN "auth_token" text;--> statement-breakpoint
ALTER TABLE "monitored_websites" ADD COLUMN "scrape_interval" varchar(64) DEFAULT '0 8 * * *' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_page_urls" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "product_page_urls" ADD COLUMN "last_scrape_status" varchar(16);--> statement-breakpoint
ALTER TABLE "product_page_urls" ADD COLUMN "last_scrape_error" text;--> statement-breakpoint
ALTER TABLE "product_page_urls" ADD COLUMN "last_scrape_count" integer;--> statement-breakpoint
ALTER TABLE "product_page_urls" ADD COLUMN "last_scraped_at" timestamp;--> statement-breakpoint
ALTER TABLE "product_page_urls" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_website_id_monitored_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."monitored_websites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "url_filters" ADD CONSTRAINT "url_filters_url_id_product_page_urls_id_fk" FOREIGN KEY ("url_id") REFERENCES "public"."product_page_urls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "url_filters" ADD CONSTRAINT "url_filters_filter_id_filters_id_fk" FOREIGN KEY ("filter_id") REFERENCES "public"."filters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_website_id_monitored_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."monitored_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_filters" ADD CONSTRAINT "website_filters_website_id_monitored_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."monitored_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_filters" ADD CONSTRAINT "website_filters_filter_id_filters_id_fk" FOREIGN KEY ("filter_id") REFERENCES "public"."filters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_url_filter" ON "url_filters" USING btree ("url_id","filter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_website_filter" ON "website_filters" USING btree ("website_id","filter_id");--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filters" ADD CONSTRAINT "filters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitored_websites" ADD CONSTRAINT "monitored_websites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_base_url" ON "monitored_websites" USING btree ("user_id","base_url");