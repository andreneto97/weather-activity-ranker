import { describe, expect, it } from '@jest/globals';
import { loadEnv } from './env.js';
import { createRateLimitOptions } from './rate-limit.js';

describe('createRateLimitOptions', () => {
  it('reads limits from env', () => {
    const opts = createRateLimitOptions(
      loadEnv({ RATE_LIMIT_MAX: '10', RATE_LIMIT_WINDOW_MS: '5000' }),
    );
    expect(opts.max).toBe(10);
    expect(opts.timeWindow).toBe(5000);
  });

  // Health/ready exclusion is done at the route level (`config: { rateLimit: false }`)
  // in main.ts, not here. See rate-limit.ts docstring.

  it('builds a JSON 429 response with Retry-After seconds', () => {
    const opts = createRateLimitOptions(loadEnv({}));
    // The plugin's context signature has more fields — cast for the test.
    const body = opts.errorResponseBuilder?.(
      { url: '/graphql' } as never,
      { ttl: 4200, max: 60, ban: false, after: '' } as never,
    );
    expect(body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      retryAfter: 5,
    });
  });
});
