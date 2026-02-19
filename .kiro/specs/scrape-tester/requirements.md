# Requirements Document

## Introduction

The Scrape Tester feature adds a dedicated "Test Scrape" page to the Deal Monitor web application. This page allows users to manually input a specific product page URL and run the existing scraper/parser pipeline against it on demand, displaying the parsed results immediately. Unlike the existing cron-based scrape job that processes all configured websites and persists deals to the database, the Test Scrape page is a read-only debugging tool that does not save any data.

## Glossary

- **Test_Scrape_Page**: A new page in the Deal Monitor app accessible from the sidebar, providing a form to input a URL and view parsed scrape results.
- **Scrape_API**: A new server-side API route that accepts a single URL, fetches and parses the page, and returns the extracted product variant data as JSON.
- **Product_Variant**: A parsed product data object containing fields such as product name, brand, list price, best price, discount percentage, image URL, product URL, categories, and stock status.
- **Sidebar_Navigation**: The existing sidebar component that provides links to all pages in the application.

## Requirements

### Requirement 1: Sidebar Navigation Entry

**User Story:** As a user, I want to see a "Test Scrape" link in the sidebar navigation, so that I can easily access the test scrape page.

#### Acceptance Criteria

1. THE Sidebar_Navigation SHALL display a "Test Scrape" navigation item with a distinct icon.
2. WHEN a user clicks the "Test Scrape" navigation item, THE Sidebar_Navigation SHALL navigate to the `/test-scrape` route.
3. WHILE the user is on the `/test-scrape` route, THE Sidebar_Navigation SHALL highlight the "Test Scrape" item as active.

### Requirement 2: URL Input and Scrape Trigger

**User Story:** As a user, I want to paste a product page URL and trigger a scrape, so that I can test the scraper against a specific page.

#### Acceptance Criteria

1. THE Test_Scrape_Page SHALL display a text input field for entering a product page URL and a submit button to trigger the scrape.
2. WHEN a user submits a valid URL, THE Test_Scrape_Page SHALL send the URL to the Scrape_API and display a loading indicator while the request is in progress.
3. WHEN a user submits an empty or whitespace-only URL, THE Test_Scrape_Page SHALL display a validation error and prevent the API call.
4. WHEN a user submits a URL that is not a valid HTTP or HTTPS URL, THE Test_Scrape_Page SHALL display a validation error and prevent the API call.

### Requirement 3: Server-Side Scrape Execution

**User Story:** As a user, I want the scraper to fetch and parse a single URL on the server, so that I can see the extracted product data without affecting the database.

#### Acceptance Criteria

1. WHEN the Scrape_API receives a valid URL, THE Scrape_API SHALL fetch the page HTML using the existing HTTP client.
2. WHEN the Scrape_API receives a valid URL, THE Scrape_API SHALL parse the fetched HTML using the existing parser to extract Product_Variant data.
3. THE Scrape_API SHALL return the extracted Product_Variant array as a JSON response without persisting any data to the database.
4. IF the HTTP client fails to fetch the URL, THEN THE Scrape_API SHALL return an error response with a descriptive message.
5. IF the parser cannot extract __NEXT_DATA__ from the fetched HTML, THEN THE Scrape_API SHALL return an error response indicating the page format is unsupported.

### Requirement 4: Results Display

**User Story:** As a user, I want to see the parsed product variants displayed clearly, so that I can verify the scraper output for a given page.

#### Acceptance Criteria

1. WHEN the Scrape_API returns Product_Variant data, THE Test_Scrape_Page SHALL display each variant showing: product name, brand, list price, best price, discount percentage, stock status, image (if available), and product URL.
2. WHEN the Scrape_API returns an empty variant array, THE Test_Scrape_Page SHALL display a message indicating no products were found on the page.
3. WHEN the Scrape_API returns an error, THE Test_Scrape_Page SHALL display the error message to the user.
4. THE Test_Scrape_Page SHALL display a summary showing the total number of variants found and the page type (listing page or product page).

### Requirement 5: Input Validation

**User Story:** As a user, I want clear feedback when I enter an invalid URL, so that I understand what input is expected.

#### Acceptance Criteria

1. WHEN a user submits a URL, THE Test_Scrape_Page SHALL validate that the URL starts with `http://` or `https://`.
2. WHEN validation fails, THE Test_Scrape_Page SHALL display a specific error message describing the validation issue.
3. WHEN validation succeeds, THE Test_Scrape_Page SHALL clear any previous validation errors before sending the request.
