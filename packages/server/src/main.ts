import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { buildApollo, registerApollo } from './adapters/inbound/graphql/apollo.js';
import { buildContainer } from './composition-root.js';
import { loadEnv } from './infrastructure/env.js';
import { createFastify } from './infrastructure/fastify-factory.js';
import { createLogger } from './infrastructure/logger.js';
import { createRateLimitOptions } from './infrastructure/rate-limit.js';
import { requestContextPlugin } from './infrastructure/request-context.js';

/**
 * Server entrypoint. See specs/04-graphql-schema.spec.md §Fastify server layout
 * for the plugin registration order rationale.
 */
async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const rootLogger = createLogger(env);
  const container = buildContainer(env, { logger: rootLogger });

  const fastify = createFastify(env, rootLogger);

  // Apollo needs the Fastify instance so its drain plugin can hook shutdown.
  const apollo = buildApollo(fastify, env);
  await apollo.start();

  // 1. Global infra
  // CSP with an allowlist tuned for what we actually load:
  //   - `self` for all first-party JS/CSS/JSON
  //   - `data:` for SVG data-URIs (favicon, some inline Meteocons)
  //   - `connect-src` adds Anthropic + Open-Meteo since the browser doesn't
  //     talk to them directly today (all upstream goes via backend), but a
  //     future move to any client-side call would need these; keeping the list
  //     narrow makes future additions an explicit decision.
  //   - `frame-ancestors 'none'` for click-jacking protection.
  //   - `unsafe-inline` on style-src is required by Tailwind v4's runtime
  //     inline `<style>` tags for CSS-in-JS-style utility classes.
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  });
  // In production the SPA is served from the same origin as `/graphql` via
  // `fastify-static` below, so CORS is largely defensive here — it stops a
  // localhost dev from talking to the deployed GraphQL and (with the
  // `credentials: false` pin below) precludes a CSRF surface if that ever
  // changes. In dev, CORS is what lets Vite (`:5173`) talk to Fastify
  // (`:4000`). Origin list is Zod-validated at boot (absolute URLs, no `*`);
  // `filter(Boolean)` drops empty entries from strings like `"a,,b"`.
  await fastify.register(fastifyCors, {
    origin: env.CORS_ORIGIN.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // Explicit: this API has no cookies / session auth, so we never want
    // credentialed cross-origin requests. Pinning `false` here so a future
    // contributor who flips this on has to also think about origin validation
    // (a wildcard + credentials would be a real CSRF surface).
    credentials: false,
  });
  await fastify.register(requestContextPlugin);
  await fastify.register(fastifyRateLimit, createRateLimitOptions(env));

  // 2. Health probe — registered BEFORE Apollo/static so nothing shadows it.
  // Rate-limit disabled per-route so K8s / Fly.io probes never get 429'd.
  // `/ready` was removed: it was static-identical to `/health`; if we ever
  // gain a meaningful readiness signal (DB pool warmed, prewarm complete),
  // re-introduce it with real logic rather than a placeholder.
  fastify.get('/health', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

  // 3. GraphQL
  await registerApollo(fastify, apollo, container);

  // 4. Static + SPA fallback (prod only; in dev the frontend runs on Vite).
  //
  // Resolve the SPA dir relative to THIS FILE, not `process.cwd()` — inside
  // the Docker image the process runs from `/app` (see Dockerfile CMD), and
  // walking up from cwd lands us at `/web/dist` which doesn't exist. Using
  // `import.meta.url` anchors to `packages/server/dist/main.js` and lets us
  // walk the tree correctly:
  //     packages/server/dist/main.js  →  ../../web/dist
  if (env.NODE_ENV === 'production') {
    const thisFileDir = path.dirname(fileURLToPath(import.meta.url));
    const webDistDir = path.resolve(thisFileDir, '..', '..', 'web', 'dist');
    await fastify.register(fastifyStatic, {
      root: webDistDir,
      prefix: '/',
      wildcard: false,
    });
    fastify.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET') return reply.status(404).send({ error: 'Not found' });
      // Only serve the SPA shell to browser navigations that actually want
      // HTML. XHR/fetch probes to a mistyped endpoint (`/graphqql`, `/api/x`)
      // should get a real 404 instead of an HTML 200 they can't parse.
      const accept = req.headers.accept ?? '';
      if (!accept.includes('text/html')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // 5. Listen
  await fastify.listen({ port: env.PORT, host: '0.0.0.0' });

  // 6. Graceful shutdown
  const shutdown = async (signal: string) => {
    rootLogger.info({ signal }, 'shutting down');
    try {
      await fastify.close();
      process.exit(0);
    } catch (err) {
      rootLogger.error({ err }, 'shutdown failed');
      process.exit(1);
    }
  };
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => {
      void shutdown(sig);
    });
  }

  // 7. Cache pre-warm (live mode only — stub is already instant).
  if (env.OPEN_METEO_MODE === 'live') {
    void prewarmCache(container, rootLogger);
  }
}

const PREWARM_CITIES = ['Lisbon', 'London', 'Tokyo', 'Chamonix', 'Rio de Janeiro'] as const;

async function prewarmCache(
  container: Awaited<ReturnType<typeof buildContainer>>,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  logger.info({ cities: PREWARM_CITIES }, 'pre-warming cache');
  await Promise.allSettled(
    PREWARM_CITIES.map(async (city) => {
      try {
        await container.rankActivities.execute({ cityQuery: city });
      } catch (err) {
        logger.warn({ err, city }, 'pre-warm failed for city');
      }
    }),
  );
  logger.info('pre-warm complete');
}

bootstrap().catch((err: unknown) => {
  console.error('bootstrap failed', err);
  process.exit(1);
});
