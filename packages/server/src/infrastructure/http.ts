import pLimit from 'p-limit';
import { fetch } from 'undici';
import type { ZodType } from 'zod';
import { UpstreamError } from '../domain/errors.js';
import { getRequestId } from './request-context.js';

/**
 * Note on `fetch`: we import from `undici` explicitly instead of using Node's
 * global `fetch`. Node 22's global fetch is powered by Node's INTERNAL undici,
 * which is a different instance from the npm `undici` package we install.
 * `setGlobalDispatcher()` from the npm package doesn't affect global fetch —
 * they use separate dispatchers. Importing fetch from the npm package keeps
 * requests and MockAgent (in tests) on the same dispatcher.
 */

/**
 * Shared HTTP client for outbound Open-Meteo calls.
 *
 * Responsibilities:
 *   - Assemble URL from `url` + `params` (skips undefined values)
 *   - Native fetch + AbortController for timeout
 *   - Propagate x-request-id from AsyncLocalStorage as downstream header
 *   - Retry (inline loop, no p-retry — see AI_ASSIST rejection): 3 attempts,
 *     exp backoff w/ jitter, ONLY on 5xx/429/timeout (never on 4xx or Zod parse
 *     errors — those signal a real problem)
 *   - Concurrency cap (p-limit): at most 4 concurrent outbound requests per
 *     process. Combined with GraphQL depth/alias validation, this bounds the
 *     Open-Meteo fanout under adversarial queries.
 *   - On success: schema.parse(json) — throws UpstreamError('… Schema mismatch: …') on drift
 *   - On failure: throws UpstreamError(provider, message)
 *
 * See specs/03-open-meteo-adapters.spec.md §Shared HTTP client.
 */

export interface HttpGetOptions<T> {
  readonly url: string;
  readonly params?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly provider: string;
  readonly schema: ZodType<T>;
  readonly timeoutMs?: number;
}

export interface HttpClient {
  getJson<T>(opts: HttpGetOptions<T>): Promise<T>;
}

export interface HttpClientDefaults {
  readonly timeoutMs: number;
  readonly retries?: number;
  /** Max concurrent outbound HTTP requests (defaults to 4). */
  readonly concurrency?: number;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_MIN_TIMEOUT_MS = 100;
const DEFAULT_MAX_TIMEOUT_MS = 1600;
const DEFAULT_CONCURRENCY = 4;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Marker class for errors that must NOT be retried (4xx, Zod parse failures).
 * The retry loop unwraps and rethrows the underlying UpstreamError.
 */
class DoNotRetryError extends Error {
  constructor(public readonly inner: UpstreamError) {
    super(inner.message);
    this.name = 'DoNotRetryError';
  }
}

export function createHttpClient(defaults: HttpClientDefaults): HttpClient {
  // Process-wide gate. Every outbound request queues through this — combined
  // with GraphQL max-depth + max-aliases, this bounds the Open-Meteo fanout
  // an adversarial GraphQL query can trigger.
  const gate = pLimit(defaults.concurrency ?? DEFAULT_CONCURRENCY);
  return {
    async getJson(opts) {
      const url = buildUrl(opts.url, opts.params);
      const timeoutMs = opts.timeoutMs ?? defaults.timeoutMs;
      const retries = defaults.retries ?? DEFAULT_RETRIES;

      const attempt = async (): Promise<unknown> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const headers: Record<string, string> = { accept: 'application/json' };
          const requestId = getRequestId();
          if (requestId) headers['x-request-id'] = requestId;

          const res = await fetch(url, { signal: ctrl.signal, headers });

          if (!res.ok) {
            // Read a snippet of the body so error messages are useful (Open-Meteo returns
            // JSON like { error: true, reason: '...' } on 4xx).
            const bodyText = await res.text().catch(() => '');
            const message = `HTTP ${res.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`;
            const err = new UpstreamError(opts.provider, message);
            if (!RETRYABLE_STATUS.has(res.status)) throw new DoNotRetryError(err);
            throw err;
          }

          const json = (await res.json()) as unknown;
          const parsed = opts.schema.safeParse(json);
          if (!parsed.success) {
            // Zod failures are drift / corruption — never retryable.
            throw new DoNotRetryError(
              new UpstreamError(
                opts.provider,
                `Schema mismatch: ${parsed.error.issues
                  .slice(0, 3)
                  .map((i) => `${i.path.join('.')} ${i.message}`)
                  .join('; ')}`,
              ),
            );
          }
          return parsed.data;
        } catch (err) {
          if (err instanceof DoNotRetryError) throw err;
          if (err instanceof UpstreamError) throw err; // preserve provider + message
          if (err instanceof Error && err.name === 'AbortError') {
            // fetch timeout → retryable
            throw new UpstreamError(opts.provider, `Timeout after ${timeoutMs}ms`, err);
          }
          throw new UpstreamError(opts.provider, `Network error: ${String(err)}`, err);
        } finally {
          clearTimeout(timer);
        }
      };

      return gate(() =>
        runWithRetries(attempt, {
          retries,
          minTimeoutMs: DEFAULT_MIN_TIMEOUT_MS,
          maxTimeoutMs: DEFAULT_MAX_TIMEOUT_MS,
        }),
      ) as Promise<ReturnType<typeof opts.schema.parse>>;
    },
  };
}

/**
 * Inline retry loop with exponential backoff + jitter.
 * Bails out immediately on DoNotRetryError (unwraps and rethrows inner error).
 */
interface RetryOpts {
  retries: number;
  minTimeoutMs: number;
  maxTimeoutMs: number;
}

async function runWithRetries<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let lastErr: unknown;
  const maxAttempts = opts.retries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DoNotRetryError) throw err.inner;
      lastErr = err;
      if (attempt === maxAttempts) break;

      const backoffMs = Math.min(opts.maxTimeoutMs, opts.minTimeoutMs * 2 ** (attempt - 1));
      const jittered = backoffMs * (0.5 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, jittered));
    }
  }
  throw lastErr;
}

function buildUrl(
  base: string,
  params?: Readonly<Record<string, string | number | boolean | undefined>>,
): string {
  if (!params) return base;
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}
