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

// Better Auth tables
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});

export const monitoredWebsites = pgTable('monitored_websites', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .references(() => user.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  baseUrl: varchar('base_url', { length: 2048 }).notNull(),
  active: boolean('active').default(true).notNull(),
  productSchema: text('product_schema'),
  authToken: text('auth_token'),
  scrapeInterval: varchar('scrape_interval', { length: 64 }).default('0 8 * * *').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uniqueUserUrl: uniqueIndex('unique_user_base_url').on(table.userId, table.baseUrl),
}));

export const productPageUrls = pgTable(
  'product_page_urls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    websiteId: uuid('website_id')
      .references(() => monitoredWebsites.id, { onDelete: 'cascade' })
      .notNull(),
    url: varchar('url', { length: 2048 }).notNull(),
    active: boolean('active').default(true).notNull(),
    lastScrapeStatus: varchar('last_scrape_status', { length: 16 }),  // 'ok' | 'error' | null
    lastScrapeError: text('last_scrape_error'),
    lastScrapeCount: integer('last_scrape_count'),
    lastScrapedAt: timestamp('last_scraped_at'),
    note: text('note'),
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
  userId: text('user_id')
    .references(() => user.id, { onDelete: 'cascade' })
    .notNull(),
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
  userId: text('user_id')
    .references(() => user.id, { onDelete: 'cascade' })
    .notNull(),
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
  websiteName: varchar('website_name', { length: 255 }),
  filterId: uuid('filter_id').references(() => filters.id),
  foundAt: timestamp('found_at').defaultNow().notNull(),
});

export const seenItems = pgTable('seen_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  compositeId: varchar('composite_id', { length: 512 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
}, (table) => ({
  uniqueUserComposite: uniqueIndex('seen_items_user_composite_unique').on(table.userId, table.compositeId),
}));

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  dealId: uuid('deal_id')
    .references(() => deals.id, { onDelete: 'cascade' })
    .notNull(),
  read: boolean('read').default(false).notNull(),
  dismissed: boolean('dismissed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
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

export const scrapeRuns = pgTable('scrape_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .references(() => user.id, { onDelete: 'cascade' }),
  websiteId: uuid('website_id').references(() => monitoredWebsites.id, { onDelete: 'set null' }),
  websiteName: varchar('website_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(), // 'completed' | 'error' | 'cancelled'
  source: varchar('source', { length: 32 }), // 'manual' | 'scheduled'
  totalProducts: integer('total_products').default(0).notNull(),
  newDeals: integer('new_deals').default(0).notNull(),
  errorCount: integer('error_count').default(0).notNull(),
  durationMs: integer('duration_ms').default(0).notNull(),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at').defaultNow().notNull(),
});



export const websiteFilters = pgTable(
  'website_filters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    websiteId: uuid('website_id')
      .references(() => monitoredWebsites.id, { onDelete: 'cascade' })
      .notNull(),
    filterId: uuid('filter_id')
      .references(() => filters.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniquePair: uniqueIndex('unique_website_filter').on(table.websiteId, table.filterId),
  })
);

export const urlFilters = pgTable(
  'url_filters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    urlId: uuid('url_id')
      .references(() => productPageUrls.id, { onDelete: 'cascade' })
      .notNull(),
    filterId: uuid('filter_id')
      .references(() => filters.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniquePair: uniqueIndex('unique_url_filter').on(table.urlId, table.filterId),
  })
);

