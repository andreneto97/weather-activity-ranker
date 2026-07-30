import type { RateLimitPluginOptions } from '@fastify/rate-limit';
import type { ServerEnv } from './env.js';

/**
 * Configuration bundle for `@fastify/rate-limit`. Actual plugin registration
 * happens in main.ts (see specs/04-graphql-schema.spec.md §Fastify server layout).
 *
 * Notes:
 *   - Per-IP token bucket (plugin's default keyGenerator uses `req.ip`).
 *   - **Health/ready exclusion is done at the ROUTE level**: those routes are
 *     registered with `config: { rateLimit: false }`. `@fastify/rate-limit` v10+
 *     does not expose a global `skip` predicate — the recommended way is
 *     per-route config, which is also the least surprising.
 *   - `errorResponseBuilder` returns JSON with a `retryAfter` (seconds) so the
 *     frontend can respect it (see specs/05 §Rate-limit handling).
 */
export function createRateLimitOptions(env: ServerEnv): RateLimitPluginOptions {
  return {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry in ${Math.ceil(context.ttl / 1000)}s.`,
      retryAfter: Math.ceil(context.ttl / 1000),
    }),
  };
}
