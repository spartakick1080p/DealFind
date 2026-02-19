import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithRetry,
  resetRateLimitTimer,
  type HttpClientConfig,
} from "../http-client";

const defaultConfig: HttpClientConfig = {
  rateLimit: 0, // no rate limiting in most tests
  maxRetries: 2,
  backoffBase: 10,
  backoffMax: 100,
  timeout: 5000,
};

beforeEach(() => {
  resetRateLimitTimer();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchWithRetry", () => {
  it("returns the response on a successful fetch", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

    const result = await fetchWithRetry("https://example.com", defaultConfig);

    expect(result).toBe(mockResponse);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and returns response on subsequent success", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const result = await fetchWithRetry("https://example.com", {
      ...defaultConfig,
      backoffBase: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 403 status", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const result = await fetchWithRetry("https://example.com", {
      ...defaultConfig,
      backoffBase: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
  });

  it("retries on 503 status", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response("service unavailable", { status: 503 })
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const result = await fetchWithRetry("https://example.com", {
      ...defaultConfig,
      backoffBase: 1,
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe(200);
  });

  it("returns null after exhausting all retries on retryable errors", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }));

    const result = await fetchWithRetry("https://example.com", {
      ...defaultConfig,
      backoffBase: 1,
    });

    expect(result).toBeNull();
    // 1 initial + 2 retries = 3 total
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns null immediately on non-retryable HTTP errors (e.g. 404)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not found", { status: 404 })
    );

    const result = await fetchWithRetry("https://example.com", defaultConfig);

    expect(result).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns null when the URL is unreachable (network error)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("fetch failed")
    );

    const result = await fetchWithRetry("https://unreachable.test", {
      ...defaultConfig,
      backoffBase: 1,
    });

    expect(result).toBeNull();
    // 1 initial + 2 retries = 3
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns null on timeout (AbortError)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted", "AbortError")
    );

    const result = await fetchWithRetry("https://slow.test", {
      ...defaultConfig,
      timeout: 10,
      backoffBase: 1,
    });

    expect(result).toBeNull();
  });

  it("applies exponential backoff with capped delay", async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      ((fn: (...args: unknown[]) => void, ms?: number) => {
        if (ms && ms > 0) {
          delays.push(ms);
        }
        // Execute immediately for test speed
        return originalSetTimeout(fn, 0);
      }) as typeof setTimeout
    );

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }));

    await fetchWithRetry("https://example.com", {
      ...defaultConfig,
      backoffBase: 100,
      backoffMax: 300,
    });

    // attempt 0: 100 * 2^0 = 100
    // attempt 1: min(100 * 2^1, 300) = 200
    expect(delays).toContain(100);
    expect(delays).toContain(200);
  });
});

describe("rate limiting", () => {
  it("enforces minimum delay between requests", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("ok", { status: 200 })
    );

    const config: HttpClientConfig = {
      ...defaultConfig,
      rateLimit: 50,
    };

    const start = Date.now();
    await fetchWithRetry("https://example.com/1", config);
    await fetchWithRetry("https://example.com/2", config);
    const elapsed = Date.now() - start;

    // Second request should have been delayed by at least ~50ms
    expect(elapsed).toBeGreaterThanOrEqual(40); // small tolerance
  });
});
