# Requirements Document

## Introduction

Deal Monitor is a web application for monitoring product deals on configured retail websites. The system scrapes product pages on a schedule, evaluates deals against user-defined filters (discount thresholds, price caps, keyword matches, category exclusions), tracks previously seen items to avoid duplicates, and delivers notifications when matching deals are found. It also provides a dashboard with metrics on deals found, items purchased, and estimated savings. The application is built with Next.js, deployed on Vercel, and uses Neon (Postgres) for persistence. The UI follows a dark, cyberpunk/futuristic aesthetic using Tailwind CSS and DaisyUI.

## Glossary

- **Scraper**: The backend component that fetches and parses product data from monitored websites
- **Monitored_Website**: A retail website configured by the user for periodic deal scraping
- **Product_Page_URL**: A specific URL on a Monitored_Website pointing to a product listing or individual product page
- **Deal**: A product variant whose computed discount meets or exceeds a configured threshold
- **Filter**: A user-defined rule set (discount threshold, max price, keyword matches, category exclusions) used to qualify deals
- **Seen_Item**: A product variant previously identified as a deal, tracked to prevent duplicate notifications within a configurable TTL window
- **Notification**: An in-app alert delivered to the user when a new deal matching a filter is found
- **Dashboard**: The main UI view displaying metrics and recent deal activity
- **Scrape_Job**: A scheduled or manually triggered execution of the Scraper against configured URLs
- **Discount_Percentage**: The computed value `((listPrice - bestPrice) / listPrice) * 100`

## Requirements

### Requirement 1: Website Monitoring Configuration

**User Story:** As a user, I want to configure retail websites for monitoring, so that the system knows which sites to scrape for deals.

#### Acceptance Criteria

1. WHEN a user submits a new website configuration with a valid base URL and name, THE Monitored_Website_Manager SHALL create a new Monitored_Website record and persist it to the database
2. WHEN a user edits an existing Monitored_Website, THE Monitored_Website_Manager SHALL update the record and persist the changes
3. WHEN a user deletes a Monitored_Website, THE Monitored_Website_Manager SHALL remove the record and all associated Product_Page_URLs from the database
4. THE Monitored_Website_Manager SHALL display all configured Monitored_Websites in a list view with name, base URL, and active status
5. IF a user submits a duplicate base URL, THEN THE Monitored_Website_Manager SHALL reject the submission and display a descriptive error message

### Requirement 2: Product Page URL Management

**User Story:** As a user, I want to add specific product page URLs to monitored websites, so that the Scraper knows which pages to check for deals.

#### Acceptance Criteria

1. WHEN a user adds a Product_Page_URL to a Monitored_Website, THE URL_Manager SHALL validate the URL format and persist it to the database
2. WHEN a user removes a Product_Page_URL, THE URL_Manager SHALL delete the record from the database
3. THE URL_Manager SHALL display all Product_Page_URLs grouped by their parent Monitored_Website
4. IF a user submits a Product_Page_URL that does not belong to the associated Monitored_Website base URL domain, THEN THE URL_Manager SHALL reject the submission and display a descriptive error message
5. IF a user submits a duplicate Product_Page_URL for the same Monitored_Website, THEN THE URL_Manager SHALL reject the submission and display a descriptive error message

### Requirement 3: Deal Filter Configuration

**User Story:** As a user, I want to create filters that define what qualifies as a deal, so that I only receive notifications for products matching my criteria.

#### Acceptance Criteria

1. WHEN a user creates a new Filter with a name, discount threshold, and optional max price, keyword list, and category exclusion list, THE Filter_Manager SHALL persist the Filter to the database
2. WHEN a user updates an existing Filter, THE Filter_Manager SHALL persist the changes to the database
3. WHEN a user deletes a Filter, THE Filter_Manager SHALL remove the record from the database
4. THE Filter_Manager SHALL display all configured Filters in a list view with their parameters
5. IF a user submits a Filter with a discount threshold outside the range 1-99, THEN THE Filter_Manager SHALL reject the submission and display a descriptive error message
6. IF a user submits a Filter with a negative max price, THEN THE Filter_Manager SHALL reject the submission and display a descriptive error message

### Requirement 4: Product Scraping

**User Story:** As a user, I want the system to periodically scrape configured product pages, so that new deals are discovered automatically.

#### Acceptance Criteria

1. WHEN a Scrape_Job is triggered, THE Scraper SHALL fetch each configured Product_Page_URL and parse product data from the page
2. WHEN the Scraper encounters a listing page with pagination, THE Scraper SHALL follow all pages up to a configurable maximum page limit
3. WHEN the Scraper extracts product variants, THE Scraper SHALL compute the Discount_Percentage for each variant using listPrice and the lowest available price (activePrice or salePrice)
4. WHEN the Scraper identifies a product variant as a Deal based on active Filters, THE Scraper SHALL persist the Deal to the database with product name, brand, prices, discount percentage, image URL, and product page URL
5. IF the Scraper encounters an HTTP error (429, 403, 503), THEN THE Scraper SHALL retry the request with exponential backoff up to a configurable maximum retry count
6. IF the Scraper encounters an unreachable URL, THEN THE Scraper SHALL log the failure and continue processing remaining URLs
7. THE Scraper SHALL enforce a configurable rate limit between HTTP requests to avoid overloading target websites
8. WHEN a Scrape_Job completes, THE Scraper SHALL log the total products encountered and execution duration

### Requirement 5: Duplicate Deal Detection

**User Story:** As a user, I want the system to track previously found deals, so that I do not receive duplicate notifications for the same product.

#### Acceptance Criteria

1. WHEN the Scraper identifies a Deal, THE Seen_Item_Tracker SHALL check whether the deal's composite identifier (productId + skuId) already exists in the database
2. WHEN a Deal's composite identifier is not found in the Seen_Item database, THE Seen_Item_Tracker SHALL mark the Deal as new and record it with a configurable TTL expiry timestamp
3. WHEN a Deal's composite identifier is found in the Seen_Item database and the TTL has not expired, THE Seen_Item_Tracker SHALL skip the Deal and suppress notification
4. WHEN a Seen_Item's TTL expires, THE Seen_Item_Tracker SHALL treat subsequent occurrences of that composite identifier as new deals
5. THE Seen_Item_Tracker SHALL compute the composite identifier as `productId:skuId` when a skuId is present, and `productId` when skuId is absent

### Requirement 6: Deal Notifications

**User Story:** As a user, I want to receive notifications when new deals matching my filters are found, so that I can act on them promptly.

#### Acceptance Criteria

1. WHEN a new Deal matching an active Filter is found, THE Notification_Service SHALL create an in-app Notification containing the product name, brand, prices, discount percentage, image, and product page link
2. THE Notification_Service SHALL display unread Notifications in a notification panel accessible from the main navigation
3. WHEN a user marks a Notification as read, THE Notification_Service SHALL update the Notification status and reflect the change in the UI
4. WHEN a user dismisses a Notification, THE Notification_Service SHALL remove the Notification from the active list
5. THE Notification_Service SHALL display a badge count of unread Notifications on the navigation icon

### Requirement 7: Deal Filter Matching

**User Story:** As a user, I want the system to evaluate discovered products against my filters, so that only relevant deals trigger notifications.

#### Acceptance Criteria

1. WHEN evaluating a product variant against a Filter, THE Filter_Engine SHALL compare the computed Discount_Percentage against the Filter's discount threshold and qualify the variant only if the Discount_Percentage meets or exceeds the threshold
2. WHEN a Filter specifies a max price, THE Filter_Engine SHALL disqualify any variant whose best price exceeds the max price
3. WHEN a Filter specifies keyword matches, THE Filter_Engine SHALL qualify a variant only if the product name contains at least one of the specified keywords (case-insensitive)
4. WHEN a Filter specifies category exclusions, THE Filter_Engine SHALL disqualify any variant belonging to an excluded category (case-insensitive)
5. WHEN a product variant qualifies against at least one active Filter, THE Filter_Engine SHALL mark the variant as a Deal

### Requirement 8: Metrics Dashboard

**User Story:** As a user, I want to see metrics about deals found, items purchased, and estimated savings, so that I can understand the value the system provides.

#### Acceptance Criteria

1. THE Dashboard SHALL display the total count of Deals found across all Scrape_Jobs
2. THE Dashboard SHALL display the total count of items the user has marked as purchased
3. THE Dashboard SHALL display the approximate total dollars saved, computed as the sum of (listPrice - bestPrice) for all items marked as purchased
4. THE Dashboard SHALL display recent Deals in a scrollable list with product name, brand, discount percentage, best price, and image thumbnail
5. WHEN a user marks a Deal as purchased with an actual purchase price, THE Dashboard SHALL update the purchased count and savings metrics accordingly

### Requirement 9: Scheduled Scraping

**User Story:** As a user, I want scraping to run automatically on a schedule, so that deals are discovered without manual intervention.

#### Acceptance Criteria

1. THE Scheduler SHALL trigger Scrape_Jobs at a configurable interval (default: every 30 minutes)
2. WHEN a scheduled Scrape_Job is triggered, THE Scheduler SHALL process all active Monitored_Websites and their associated Product_Page_URLs
3. WHEN a user manually triggers a Scrape_Job from the UI, THE Scheduler SHALL execute the scrape immediately regardless of the schedule
4. WHILE a Scrape_Job is in progress, THE Scheduler SHALL prevent concurrent Scrape_Jobs from starting

### Requirement 10: Responsive Dark-Themed UI

**User Story:** As a user, I want a responsive, dark-themed interface with a cyberpunk aesthetic, so that the application is visually appealing and usable on mobile devices.

#### Acceptance Criteria

1. THE UI SHALL render a dark theme by default using DaisyUI theming with a color scheme of black, grey, and orange accent
2. THE UI SHALL use Tailwind CSS card components with shadow for visual depth on all content panels
3. THE UI SHALL be fully responsive, adapting layout for mobile, tablet, and desktop viewports
4. THE UI SHALL provide a navigation structure that allows access to Dashboard, Monitored Websites, Filters, Notifications, and Settings from any page

### Requirement 11: Deal Data Persistence

**User Story:** As a user, I want all deal data and configuration stored reliably, so that nothing is lost between sessions.

#### Acceptance Criteria

1. THE Database SHALL store Monitored_Website records with fields: id, name, base_url, active status, created_at, updated_at
2. THE Database SHALL store Product_Page_URL records with fields: id, website_id (foreign key), url, created_at
3. THE Database SHALL store Filter records with fields: id, name, discount_threshold, max_price, keywords, excluded_categories, active status, created_at, updated_at
4. THE Database SHALL store Deal records with fields: id, product_id, sku_id, product_name, brand, list_price, best_price, discount_percentage, image_url, product_url, filter_id, found_at
5. THE Database SHALL store Seen_Item records with fields: id, composite_id, expires_at
6. THE Database SHALL store Notification records with fields: id, deal_id (foreign key), read status, dismissed status, created_at
7. THE Database SHALL store Purchase records with fields: id, deal_id (foreign key), actual_price, purchased_at
8. WHEN storing Deal records, THE Database SHALL encode price fields as numeric types with two decimal places of precision
