import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { mockHttp } from '../../tests/support/mock-http.js';
import { UpstreamError } from '../domain/errors.js';
import { createHttpClient } from './http.js';
import { runWithContext } from './request-context.js';

const ORIGIN = 'https://example.com';
const PATH = '/foo';
const PATH_MATCHER = /^\/foo/; // matches with or without query string
const PAYLOAD = { hello: 'world' };
const SCHEMA = z.object({ hello: z.string() });

const client = createHttpClient({ timeoutMs: 500, retries: 2 });

describe('HttpClient.getJson', () => {
  it('assembles URL with query params and returns parsed JSON', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_MATCHER, method: 'GET' }).reply(200, PAYLOAD);

    const result = await client.getJson({
      url: `${ORIGIN}${PATH}`,
      params: { a: 1, b: 'x', c: undefined },
      provider: 'test',
      schema: SCHEMA,
    });
    expect(result).toEqual(PAYLOAD);
  });

  it('propagates x-request-id from AsyncLocalStorage', async () => {
    const { pool } = mockHttp(ORIGIN);
    let seenHeader: string | undefined;
    pool
      .intercept({
        path: PATH_MATCHER,
        method: 'GET',
      })
      .reply(200, (opts) => {
        // MockAgent's opts.headers type varies across undici versions; loosen for the assertion.
        seenHeader = extractHeader(
          opts.headers as unknown as Record<string, string> | string[] | undefined,
          'x-request-id',
        );
        return PAYLOAD;
      });

    await runWithContext({ requestId: 'abc-123' }, () =>
      client.getJson({ url: `${ORIGIN}${PATH}`, provider: 'test', schema: SCHEMA }),
    );
    expect(seenHeader).toBe('abc-123');
  });

  it('retries on 500 and eventually succeeds', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_MATCHER, method: 'GET' }).reply(500, 'internal');
    pool.intercept({ path: PATH_MATCHER, method: 'GET' }).reply(200, PAYLOAD);

    const result = await client.getJson({
      url: `${ORIGIN}${PATH}`,
      provider: 'test',
      schema: SCHEMA,
    });
    expect(result).toEqual(PAYLOAD);
  });

  it('retries on 429 (rate limit)', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_MATCHER, method: 'GET' }).reply(429, 'slow down');
    pool.intercept({ path: PATH_MATCHER, method: 'GET' }).reply(200, PAYLOAD);

    const result = await client.getJson({
      url: `${ORIGIN}${PATH}`,
      provider: 'test',
      schema: SCHEMA,
    });
    expect(result).toEqual(PAYLOAD);
  });

  it('does NOT retry on 4xx (except 429)', async () => {
    const { pool } = mockHttp(ORIGIN);
    // Only one interceptor set up — if code retries, the test will fail with
    // "no interceptor found" instead of silently succeeding.
    pool.intercept({ path: PATH, method: 'GET' }).reply(400, { error: true, reason: 'bad param' });

    await expect(
      client.getJson({ url: `${ORIGIN}${PATH}`, provider: 'test', schema: SCHEMA }),
    ).rejects.toThrow(UpstreamError);
  });

  it('does NOT retry on Zod schema mismatch (adapter data drift is not transient)', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_MATCHER, method: 'GET' }).reply(200, { unexpected: 'shape' });

    await expect(
      client.getJson({ url: `${ORIGIN}${PATH}`, provider: 'test', schema: SCHEMA }),
    ).rejects.toThrow(/Schema mismatch/);
  });

  it('throws UpstreamError with provider + body snippet on 4xx', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool
      .intercept({ path: PATH, method: 'GET' })
      .reply(400, { error: true, reason: 'invalid latitude' });

    let caught: UpstreamError | null = null;
    try {
      await client.getJson({
        url: `${ORIGIN}${PATH}`,
        provider: 'open-meteo-forecast',
        schema: SCHEMA,
      });
    } catch (err) {
      if (err instanceof UpstreamError) caught = err;
    }
    expect(caught).not.toBeNull();
    expect(caught!.provider).toBe('open-meteo-forecast');
    expect(caught!.message).toContain('HTTP 400');
    expect(caught!.message).toContain('invalid latitude');
  });
});

/**
 * undici's MockAgent gives header values as a `Record<string, string> | string[]`.
 * Normalise to a single string for our checks.
 */
function extractHeader(
  headers: Record<string, string> | string[] | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  if (Array.isArray(headers)) {
    const idx = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
    return idx >= 0 && idx + 1 < headers.length ? headers[idx + 1] : undefined;
  }
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}
