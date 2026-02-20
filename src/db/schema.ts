import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  numeric,
  text,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const monitoredWebsites = pgTable('monitored_websites', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  baseUrl: varchar('base_url', { length: 2048 }).notNull().unique(),
  active: boolean('active').default(true).notNull(),
  productSchema: text('product_schema'),
  authToken: text('auth_token'),
  scrapeInterval: varchar('scrape_interval', { length: 64 }).default('0 8 * * *').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productPageUrls = pgTable(
  'product_page_urls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    websiteId: uuid('website_id')
      .references(() => monitoredWebsites.id, { onDelete: 'cascade' })
      .notNull(),
    url: varchar('url', { length: 2048 }).notNull(),
    lastScrapeStatus: varchar('last_scrape_status', { length: 16 }),  // 'ok' | 'error' | null
    lastScrapeError: text('last_scrape_error'),
    lastScrapeCount: integer('last_scrape_count'),
    lastScrapedAt: timestamp('last_scraped_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueUrl: uniqueIndex('unique_url_per_website').on(
      table.websiteId,
      table.url
    ),
  })
);

export const filters = pgTable('filters', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  discountThreshold: integer('discount_threshold').notNull(),
  maxPrice: numeric('max_price', { precision: 10, scale: 2 }),
  keywords: text('keywords').array(),
  includedCategories: text('included_categories').array(),
  excludedCategories: text('excluded_categories').array(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const deals = pgTable('deals', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: varchar('product_id', { length: 255 }).notNull(),
  skuId: varchar('sku_id', { length: 255 }),
  productName: varchar('product_name', { length: 512 }).notNull(),
  brand: varchar('brand', { length: 255 }),
  listPrice: numeric('list_price', { precision: 10, scale: 2 }).notNull(),
  bestPrice: numeric('best_price', { precision: 10, scale: 2 }).notNull(),
  discountPercentage: numeric('discount_percentage', {
    precision: 5,
    scale: 2,
  }).notNull(),
  imageUrl: varchar('image_url', { length: 2048 }),
  productUrl: varchar('product_url', { length: 2048 }).notNull(),
  filterId: uuid('filter_id').references(() => filters.id),
  foundAt: timestamp('found_at').defaultNow().notNull(),
});

export const seenItems = pgTable('seen_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  compositeId: varchar('composite_id', { length: 512 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  dealId: uuid('deal_id')
    .references(() => deals.id, { onDelete: 'cascade' })
    .notNull(),
  read: boolean('read').default(false).notNull(),
  dismissed: boolean('dismissed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  dealId: uuid('deal_id')
    .references(() => deals.id)
    .notNull(),
  actualPrice: numeric('actual_price', { precision: 10, scale: 2 }).notNull(),
  purchasedAt: timestamp('purchased_at').defaultNow().notNull(),
});
export const webhooks = pgTable('webhooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  websiteId: uuid('website_id')
    .references(() => monitoredWebsites.id, { onDelete: 'cascade' })
    .notNull(),
  service: varchar('service', { length: 64 }).notNull(), // 'discord' | 'slack' | etc.
  webhookUrl: text('webhook_url').notNull(), // encrypted — URL or channel endpoint
  authToken: text('webhook_auth_token'), // encrypted — bot token, API key, etc.
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});


