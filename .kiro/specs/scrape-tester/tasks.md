# Implementation Plan: Scrape Tester

## Overview

Add a `/test-scrape` page with a supporting API route that lets users paste a single product page URL, run the scraper/parser pipeline against it, and view the parsed results. No database writes. Reuses existing `http-client` and `parser` modules.

## Tasks

- [x] 1. Create URL validation utility
  - [x] 1.1 Create `src/lib/scraper/validate-url.ts` with a `validateScrapeUrl(url: string)` function
    - Return `{ valid: true, url: string }` or `{ valid: false, error: string }`
    - Reject empty/whitespace-only strings
    - Reject URLs not starting with `http://` or `https://`
    - Trim whitespace from input before validation
    - _Requirements: 2.3, 2.4, 5.1, 5.2_

  - [ ]* 1.2 Write property tests for URL validation
    - **Property 1: Whitespace-only URLs are rejected**
    - **Validates: Requirements 2.3**
    - **Property 2: Non-HTTP(S) URLs are rejected**
    - **Validates: Requirements 2.4, 5.1**
    - Create `src/lib/scraper/__tests__/validate-url.test.ts`
    - Use `fast-check` with minimum 100 iterations per property

- [x] 2. Create the test-scrape API route
  - [x] 2.1 Create `src/app/api/test-scrape/route.ts` with a POST handler
    - Parse JSON body and extract `url` field
    - Validate URL using `validateScrapeUrl`
    - Call `fetchWithRetry(url, config)` with a reasonable default config
    - Call `parseNextData(html)` on the response body
    - Call `extractProductVariants(payload)` and `isListingPage(payload)`
    - Return `{ variants, pageType, count }` on success
    - Return 400 for invalid URL, 502 for fetch failure, 422 for parse failure
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 2.2 Write unit tests for the API route
    - Test 400 response for invalid URL
    - Test 502 response when fetchWithRetry returns null
    - Test 422 response when parseNextData returns null
    - Test 200 response with valid variants
    - Create `src/lib/scraper/__tests__/test-scrape-api.test.ts`
    - _Requirements: 3.4, 3.5_

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create the Test Scrape page
  - [x] 4.1 Create `src/app/test-scrape/page.tsx` as a client component
    - URL text input with controlled state
    - Submit button that calls `POST /api/test-scrape`
    - Client-side validation using `validateScrapeUrl` before API call
    - Loading state: disable input and button, show spinner
    - Error display: show validation errors and API errors
    - Results display: summary bar (variant count + page type) and variant cards
    - Each variant card shows: product name, brand, list price, best price, discount percentage, stock status, image thumbnail (if available), product URL link
    - Empty results message when variant array is empty
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2, 4.3, 4.4, 5.2, 5.3_

- [x] 5. Add sidebar navigation entry
  - [x] 5.1 Update `src/components/sidebar-nav.tsx`
    - Add a `testScrape` SVG path to `ICON_PATHS`
    - Add a new nav item `{ href: '/test-scrape', label: 'Test Scrape', icon: ... }` to the `navItems` array
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 6. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The feature reuses existing `fetchWithRetry`, `parseNextData`, `extractProductVariants`, and `isListingPage` — no changes to those modules
- No database schema changes required
- Property tests use `fast-check` which is already installed
