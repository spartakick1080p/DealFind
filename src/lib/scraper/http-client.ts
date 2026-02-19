export interface HttpClientConfig {
  rateLimit: number; // min ms between requests
  maxRetries: number;
  backoffBase: number;
  backoffMax: number;
  timeout: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 403, 503]);

let lastRequestTime = 0;

/**
 * Reset the internal rate limit timer. Useful for testing.
 */
export function resetRateLimitTimer(): void {
  lastRequestTime = 0;
}

/**
 * Enforce rate limiting by delaying if the time since the last request
 * is less than the configured minimum interval.
 */
async function enforceRateLimit(rateLimitMs: number): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (lastRequestTime > 0 && elapsed < rateLimitMs) {
    const delay = rateLimitMs - elapsed;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  lastRequestTime = Date.now();
}

/**
 * Compute exponential backoff delay: min(backoffBase * 2^attempt, backoffMax)
 */
function computeBackoff(
  attempt: number,
  backoffBase: number,
  backoffMax: number
): number {
  return Math.min(backoffBase * Math.pow(2, attempt), backoffMax);
}

/**
 * Fetch a URL with rate limiting, exponential backoff on retryable HTTP errors,
 * and timeout support via AbortController.
 *
 * Returns the Response on success, or null if all retries are exhausted
 * or the URL is unreachable.
 */
/**
 * Interpolate ${ENV_VAR} references in a string with process.env values.
 * Also supports ${AUTH_TOKEN} which resolves from a runtime-provided token.
 * This lets schemas reference secrets without hardcoding them in JSON.
 */
function interpolateEnvVars(value: string, authToken?: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, envKey) => {
    if (envKey === 'AUTH_TOKEN') {
      return authToken ?? '';
    }
    return process.env[envKey] ?? '';
  });
}

/**
 * Fetch a JSON API endpoint with custom headers, method, params, and body.
 * Used by the api-json extraction method in schema-parser.
 *
 * Header values support ${ENV_VAR} and ${AUTH_TOKEN} interpolation so
 * secrets can live in .env.local or encrypted in the DB instead of
 * being hardcoded in the schema JSON.
 *
 * Returns parsed JSON + response headers, or null on failure.
 */
export async function fetchApiJson(
  apiUrl: string,
  options: {
    method?: 'GET' | 'POST';
    params?: Record<string, string>;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    timeout?: number;
    authToken?: string;
  } = {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any; responseHeaders: Record<string, string> } | null> {
  const { method = 'POST', params, headers = {}, body, timeout = 15000, authToken } = options;

  // Build URL with query params
  const url = new URL(apiUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, interpolateEnvVars(value, authToken));
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Default headers that mimic a browser request
  const defaultHeaders: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };

  // Interpolate env vars and auth token in user-provided headers
  const interpolatedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    interpolatedHeaders[key] = interpolateEnvVars(value, authToken);
  }

  const mergedHeaders = { ...defaultHeaders, ...interpolatedHeaders };

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: mergedHeaders,
      signal: controller.signal,
    };

    if (method === 'POST') {
      fetchOptions.body = JSON.stringify(body ?? {});
    }

    const response = await fetch(url.toString(), fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[http-client] API request failed: ${response.status} for ${url.toString()}`);
      return null;
    }

    // Capture response headers (e.g. rotated frontastic-session)
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const data = await response.json();
    return { data, responseHeaders };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[http-client] API request error for ${url.toString()}: ${message}`);
    return null;
  }
}

/**
 * Fetch a URL with rate limiting, exponential backoff on retryable HTTP errors,
 * and timeout support via AbortController.
 *
 * Returns the Response on success, or null if all retries are exhausted
 * or the URL is unreachable.
 */
export async function fetchWithRetry(
  url: string,
  config: HttpClientConfig
): Promise<Response | null> {
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    await enforceRateLimit(config.rateLimit);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      if (RETRYABLE_STATUS_CODES.has(response.status)) {
        if (attempt < config.maxRetries) {
          const delay = computeBackoff(
            attempt,
            config.backoffBase,
            config.backoffMax
          );
          console.warn(
            `[http-client] ${response.status} for ${url} — retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        console.error(
          `[http-client] ${response.status} for ${url} — all ${config.maxRetries} retries exhausted`
        );
        return null;
      }

      // Non-retryable HTTP error
      console.error(
        `[http-client] Non-retryable HTTP ${response.status} for ${url}`
      );
      return null;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      const message =
        error instanceof Error ? error.message : String(error);

      if (attempt < config.maxRetries) {
        const delay = computeBackoff(
          attempt,
          config.backoffBase,
          config.backoffMax
        );
        console.warn(
          `[http-client] Error fetching ${url}: ${message} — retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      console.error(
        `[http-client] Failed to fetch ${url} after ${config.maxRetries} retries: ${message}`
      );
      return null;
    }
  }

  return null;
}
