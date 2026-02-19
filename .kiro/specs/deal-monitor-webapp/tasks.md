# Implementation Plan: Deal Monitor Webapp

## Overview

Incremental implementation of the Deal Monitor webapp using Next.js App Router, Drizzle ORM with Neon Postgres, Tailwind CSS + DaisyUI. Tasks build on each other, starting with project scaffolding and database schema, then core business logic, then UI pages, and finally the scraping pipeline and cron integration.

## Tasks

- [x] 1. Project scaffolding and database setup
  - [x] 1.1 Initialize Next.js project with TypeScript, Tailwind CSS, DaisyUI, and Drizzle ORM
    - Create Next.js app with App Router
    - Install dependencies: `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`, `daisyui`, `fast-check`
    - Configure Tailwind with DaisyUI plugin and custom dark cyberpunk theme (black, grey, orange accent)
    - Configure `drizzle.config.ts` for Neon connection
    - _Requirements: 10.1_

  - [x] 1.2 Create Drizzle schema and generate initial migration
    - Implement `src/db/schema.ts` with all tables: monitored_websites, product_page_urls, filters, deals, seen_items, notifications, purchases
    - Implement `src/db/index.ts` with Neon client initialization and Drizzle instance export
    - Generate and apply initial migration
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8_

- [x] 2. Core business logic — Filter Engine
  - [x] 2.1 Implement the filter engine evaluation function
    - Create `src/lib/filter-engine.ts` with `evaluateVariant` and `findMatchingFilters` functions
    - Implement discount threshold comparison, max price check, keyword matching (case-insensitive), and category exclusion (case-insensitive)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 2.2 Write property tests for filter engine — discount threshold
    - **Property 11: Filter engine — discount threshold qualification**
    - **Validates: Requirements 7.1**

  - [ ]* 2.3 Write property tests for filter engine — max price
    - **Property 12: Filter engine — max price disqualification**
    - **Validates: Requirements 7.2**

  - [ ]* 2.4 Write property tests for filter engine — keyword matching
    - **Property 13: Filter engine — keyword matching**
    - **Validates: Requirements 7.3**

  - [ ]* 2.5 Write property tests for filter engine — category exclusion
    - **Property 14: Filter engine — category exclusion**
    - **Validates: Requirements 7.4**

  - [ ]* 2.6 Write property test for filter engine — multi-filter aggregation
    - **Property 15: Filter engine — multi-filter aggregation**
    - **Validates: Requirements 7.5**

- [x] 3. Core business logic — Discount computation and composite ID
  - [x] 3.1 Implement discount percentage computation
    - Create `src/lib/discount.ts` with `computeDiscount(listPrice, bestPrice)` and `pickBestPrice(activePrice, salePrice)` functions
    - _Requirements: 4.3_

  - [ ]* 3.2 Write property test for discount computation
    - **Property 8: Discount percentage computation**
    - **Validates: Requirements 4.3**

  - [x] 3.3 Implement composite ID computation
    - Create `src/lib/seen-tracker.ts` with `computeCompositeId(productId, skuId)` function
    - _Requirements: 5.5_

  - [ ]* 3.4 Write property test for composite ID format
    - **Property 10: Composite ID format**
    - **Validates: Requirements 5.5**

- [x] 4. Checkpoint — Core logic tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Data access layer — Monitored Websites and Product Page URLs
  - [x] 5.1 Implement server actions for Monitored Website CRUD
    - Create `src/app/websites/actions.ts` with createWebsite, updateWebsite, deleteWebsite, getWebsites, getWebsiteById
    - Include base URL uniqueness validation and cascade delete of associated URLs
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [ ]* 5.2 Write property tests for website CRUD round-trip and uniqueness
    - **Property 1: Website CRUD round-trip**
    - **Property 3: Website base URL uniqueness**
    - **Validates: Requirements 1.1, 1.2, 1.5**

  - [x] 5.3 Implement server actions for Product Page URL management
    - Create `src/app/websites/[id]/actions.ts` with addUrl, removeUrl, getUrlsByWebsite
    - Include domain validation (URL must match website base URL domain) and duplicate rejection
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [ ]* 5.4 Write property tests for URL domain validation and uniqueness
    - **Property 4: Product page URL domain validation**
    - **Property 5: Product page URL uniqueness per website**
    - **Validates: Requirements 2.1, 2.4, 2.5**

- [x] 6. Data access layer — Filters
  - [x] 6.1 Implement server actions for Filter CRUD
    - Create `src/app/filters/actions.ts` with createFilter, updateFilter, deleteFilter, getFilters, getFilterById
    - Include validation: discount threshold 1-99, max price >= 0
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

  - [ ]* 6.2 Write property tests for filter CRUD round-trip and validation
    - **Property 6: Filter CRUD round-trip**
    - **Property 7: Filter validation rejects invalid thresholds and prices**
    - **Validates: Requirements 3.1, 3.2, 3.5, 3.6**

- [x] 7. Data access layer — Seen items, Notifications, Purchases
  - [x] 7.1 Implement seen item tracker database operations
    - Extend `src/lib/seen-tracker.ts` with `isNewDeal`, `markAsSeen`, `cleanExpiredItems` using Drizzle queries
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 7.2 Write property test for seen item tracking round-trip
    - **Property 9: Seen item tracking round-trip**
    - **Validates: Requirements 5.1, 5.2, 5.3**

  - [x] 7.3 Implement notification service
    - Create `src/lib/notification-service.ts` with createNotification, getUnreadCount, getActiveNotifications, markAsRead, dismiss
    - _Requirements: 6.1, 6.3, 6.4, 6.5_

  - [ ]* 7.4 Write property test for notification state transitions
    - **Property 17: Notification state transitions**
    - **Validates: Requirements 6.3, 6.4**

  - [x] 7.5 Implement metrics service and purchase tracking
    - Create `src/lib/metrics-service.ts` with getDashboardMetrics, getRecentDeals, markAsPurchased
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [ ]* 7.6 Write property test for savings computation
    - **Property 16: Savings computation**
    - **Validates: Requirements 8.3, 8.5**

- [x] 8. Checkpoint — Data layer tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. UI — Layout and navigation
  - [x] 9.1 Create root layout with dark DaisyUI theme and navigation
    - Implement `src/app/layout.tsx` with dark theme, sidebar/bottom nav for mobile
    - Navigation links: Dashboard, Websites, Filters, Notifications, Settings
    - Notification badge showing unread count
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 6.2, 6.5_

- [x] 10. UI — Dashboard page
  - [x] 10.1 Implement dashboard page with metrics cards and recent deals
    - Create `src/app/page.tsx` with server component fetching metrics and recent deals
    - Render metrics cards (deals found, items purchased, dollars saved) using Tailwind cards with shadow
    - Render recent deals list with product name, brand, discount, price, image thumbnail
    - Include "Mark as purchased" action on each deal card
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 10.2_

- [x] 11. UI — Monitored Websites pages
  - [x] 11.1 Implement websites list page and add/edit forms
    - Create `src/app/websites/page.tsx` with website list and add form
    - Create `src/app/websites/[id]/page.tsx` with website detail, edit form, and product page URL management
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3_

- [x] 12. UI — Filters page
  - [x] 12.1 Implement filters list page and add/edit forms
    - Create `src/app/filters/page.tsx` with filter list and add/edit form
    - Display filter parameters: name, discount threshold, max price, keywords, excluded categories
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 13. UI — Notifications page
  - [x] 13.1 Implement notifications page with read/dismiss actions
    - Create `src/app/notifications/page.tsx` with notification list
    - Each notification shows deal info with mark-as-read and dismiss buttons
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 14. Checkpoint — UI pages
  - Ensure all pages render correctly, ask the user if questions arise.

- [x] 15. Scraper engine
  - [x] 15.1 Implement HTTP client with rate limiting and retry
    - Create `src/lib/scraper/http-client.ts` with fetchWithRetry, rate limiting, exponential backoff
    - _Requirements: 4.5, 4.6, 4.7_

  - [x] 15.2 Implement product page parser
    - Create `src/lib/scraper/parser.ts` with parseNextData, extractProductVariants
    - Handle listing pages (with pagination) and individual product pages
    - Extract variant data: prices, stock status, images, categories
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 15.3 Implement scrape job orchestrator
    - Create `src/lib/scraper/scraper.ts` with executeScrapeJob
    - Fetch all active websites and their URLs, parse products, evaluate against filters, track seen items, create notifications for new deals
    - Log total products encountered and duration
    - _Requirements: 4.1, 4.4, 4.8, 5.1, 5.2, 5.3, 7.5_

- [x] 16. Cron job and manual trigger
  - [x] 16.1 Implement cron API route and manual trigger
    - Create `src/app/api/cron/scrape/route.ts` with GET handler, CRON_SECRET verification
    - Add concurrency guard (database advisory lock or status check)
    - Configure `vercel.json` with cron schedule
    - Add manual trigger button on Settings page
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 17. Settings page
  - [x] 17.1 Implement settings page for scrape configuration
    - Create `src/app/settings/page.tsx` with configurable scrape interval, TTL days, rate limit, max retries
    - Store settings in a config table or environment variables
    - Include manual scrape trigger button
    - _Requirements: 9.1, 9.3_

- [ ] 18. Price precision integration test
  - [ ]* 18.1 Write property test for price precision round-trip
    - **Property 19: Price precision round-trip**
    - **Validates: Requirements 11.8**

- [x] 19. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- The scraper engine (tasks 15-16) depends on all prior data layer and business logic tasks
