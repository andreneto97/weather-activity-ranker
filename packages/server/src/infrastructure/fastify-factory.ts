import Fastify, { type FastifyInstance } from 'fastify';
import type { Logger } from 'pino';
import type { ServerEnv } from './env.js';

/**
 * Central factory for the Fastify instance. Two things are tricky enough
 * they were leaking to callers:
 *
 *   1. `loggerInstance: Logger` narrows the Fastify generic to pino's Logger,
 *      which doesn't structurally satisfy `FastifyBaseLogger`. Cast to the
 *      base shape here so downstream plugin helpers (buildApollo, etc.)
 *      type-check cleanly. Runtime is unchanged — Fastify accepts any
 *      pino-compatible logger.
 *   2. `trustProxy` MUST be on in production (Fly.io / most PaaS put the app
 *      behind their edge proxy → without this, per-IP rate limiting collapses
 *      to a single global limit). Off in dev so `request.ip` is the real
 *      loopback address rather than the proxy header, which makes local
 *      debugging saner.
 *
 * Extracting this here means the cast + trustProxy policy live in exactly one
 * place; the Pact provider verification test uses the same shape without
 * duplicating either concern.
 */
export function createFastify(env: ServerEnv, logger: Logger): FastifyInstance {
  return Fastify({
    loggerInstance: logger,
    trustProxy: env.NODE_ENV === 'production',
    // Cap request bodies to 32 KB — GraphQL queries in this app are tiny
    // (largest observed ~2 KB). Default Fastify limit is 1 MB, generous
    // enough to combine with high-fanout queries for a real DoS lever.
    bodyLimit: 32 * 1024,
  }) as unknown as FastifyInstance;
}
