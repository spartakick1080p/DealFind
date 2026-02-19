import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the http-client and parser modules before importing the route
vi.mock('@/lib/scraper/http-client', () => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock('@/lib/scraper/parser', () => ({
  parseNextData: vi.fn(),
  extractProductVariants: vi.fn(),
  isListingPage: vi.fn(),
}));

vi.mock('@/lib/scraper/schema-parser', () => ({
  parseWithSchema: vi.fn(),
  parseSchemaJson: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));

vi.mock('@/db/schema', () => ({
  monitoredWebsites: {},
}));

// We do NOT mock validate-url — it's pure logic and cheap to run for real
import { POST } from '@/app/api/test-scrape/route';
import { fetchWithRetry } from '@/lib/scraper/http-client';
import {
  parseNextData,
  extractProductVariants,
  isListingPage,
} from '@/lib/scraper/parser';

const mockFetchWithRetry = vi.mocked(fetchWithRetry);
const mockParseNextData = vi.mocked(parseNextData);
const mockExtractProductVariants = vi.mocked(extractProductVariants);
const mockIsListingPage = vi.mocked(isListingPage);

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/test-scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/test-scrape', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // --- 400 cases ---

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/test-scrape', {
      method: 'POST',
      body: 'not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Invalid JSON body');
  });

  it('returns 400 when url field is missing', async () => {
    const res = await POST(makeRequest({ notUrl: 'hello' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing or invalid "url" field');
  });

  it('returns 400 when url field is not a string', async () => {
    const res = await POST(makeRequest({ url: 123 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Missing or invalid "url" field');
  });

  it('returns 400 for empty URL', async () => {
    const res = await POST(makeRequest({ url: '' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('URL cannot be empty');
  });

  it('returns 400 for whitespace-only URL', async () => {
    const res = await POST(makeRequest({ url: '   ' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('URL cannot be empty');
  });

  it('returns 400 for non-HTTP URL', async () => {
    const res = await POST(makeRequest({ url: 'ftp://example.com' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('URL must start with http:// or https://');
  });

  // --- 502 case ---

  it('returns 502 when fetchWithRetry returns null', async () => {
    mockFetchWithRetry.mockResolvedValue(null);

    const res = await POST(makeRequest({ url: 'https://example.com' }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch the URL');
    expect(mockFetchWithRetry).toHaveBeenCalledOnce();
  });

  // --- 422 case ---

  it('returns 422 when parseNextData returns null', async () => {
    mockFetchWithRetry.mockResolvedValue(
      new Response('<html>no next data</html>', { status: 200 }),
    );
    mockParseNextData.mockReturnValue(null);

    const res = await POST(makeRequest({ url: 'https://example.com' }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe('Could not parse product data from this page. Try selecting a website with a custom schema configured.');
  });

  // --- 200 success cases ---

  it('returns 200 with variants for a listing page', async () => {
    const fakeVariants = [
      { productId: '1', displayName: 'Product A', bestPrice: 10 },
    ];
    mockFetchWithRetry.mockResolvedValue(
      new Response('<html>listing</html>', { status: 200 }),
    );
    mockParseNextData.mockReturnValue({ props: {} });
    mockExtractProductVariants.mockReturnValue(fakeVariants as never);
    mockIsListingPage.mockReturnValue(true);

    const res = await POST(makeRequest({ url: 'https://example.com/products' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      variants: fakeVariants,
      pageType: 'listing',
      count: 1,
      schemaUsed: 'default',
    });
  });

  it('returns 200 with variants for a product page', async () => {
    const fakeVariants = [
      { productId: '2', displayName: 'Product B', bestPrice: 20 },
      { productId: '2', displayName: 'Product B - Red', bestPrice: 22 },
    ];
    mockFetchWithRetry.mockResolvedValue(
      new Response('<html>product</html>', { status: 200 }),
    );
    mockParseNextData.mockReturnValue({ props: {} });
    mockExtractProductVariants.mockReturnValue(fakeVariants as never);
    mockIsListingPage.mockReturnValue(false);

    const res = await POST(makeRequest({ url: 'https://example.com/product/123' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      variants: fakeVariants,
      pageType: 'product',
      count: 2,
      schemaUsed: 'default',
    });
  });

  it('returns pageType "unknown" when no variants and not a listing page', async () => {
    mockFetchWithRetry.mockResolvedValue(
      new Response('<html>empty</html>', { status: 200 }),
    );
    mockParseNextData.mockReturnValue({ props: {} });
    mockExtractProductVariants.mockReturnValue([]);
    mockIsListingPage.mockReturnValue(false);

    const res = await POST(makeRequest({ url: 'https://example.com/about' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      variants: [],
      pageType: 'unknown',
      count: 0,
      schemaUsed: 'default',
    });
  });

  it('trims whitespace from URL before fetching', async () => {
    mockFetchWithRetry.mockResolvedValue(
      new Response('<html></html>', { status: 200 }),
    );
    mockParseNextData.mockReturnValue({ props: {} });
    mockExtractProductVariants.mockReturnValue([]);
    mockIsListingPage.mockReturnValue(false);

    await POST(makeRequest({ url: '  https://example.com  ' }));
    expect(mockFetchWithRetry).toHaveBeenCalledWith(
      'https://example.com',
      expect.any(Object),
    );
  });
});
