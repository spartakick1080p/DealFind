CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"sku_id" varchar(255),
	"product_name" varchar(512) NOT NULL,
	"brand" varchar(255),
	"list_price" numeric(10, 2) NOT NULL,
	"best_price" numeric(10, 2) NOT NULL,
	"discount_percentage" numeric(5, 2) NOT NULL,
	"image_url" varchar(2048),
	"product_url" varchar(2048) NOT NULL,
	"filter_id" uuid,
	"found_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"discount_threshold" integer NOT NULL,
	"max_price" numeric(10, 2),
	"keywords" text[],
	"excluded_categories" text[],
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitored_websites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"base_url" varchar(2048) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "monitored_websites_base_url_unique" UNIQUE("base_url")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_page_urls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"actual_price" numeric(10, 2) NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seen_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"composite_id" varchar(512) NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "seen_items_composite_id_unique" UNIQUE("composite_id")
);
--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_filter_id_filters_id_fk" FOREIGN KEY ("filter_id") REFERENCES "public"."filters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_page_urls" ADD CONSTRAINT "product_page_urls_website_id_monitored_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."monitored_websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_url_per_website" ON "product_page_urls" USING btree ("website_id","url");