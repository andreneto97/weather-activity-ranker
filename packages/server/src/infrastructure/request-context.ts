import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Request-scoped context propagated via AsyncLocalStorage so any downstream
 * code (adapters, loggers, etc.) can read the current x-request-id without
 * threading it explicitly through every function.
 *
 * See specs/04-graphql-schema.spec.md §infrastructure/request-context.ts.
 */

export interface RequestContext {
  readonly requestId: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

/**
 * Fastify plugin: installs an `onRequest` hook that
 *   - reads (or generates) `x-request-id`
 *   - echoes it back on the response
 *   - runs the rest of the request lifecycle inside AsyncLocalStorage
 *     so getRequestId() works from anywhere in the call chain.
 */
/**
 * Accepted shape for a client-supplied x-request-id. Anything outside these
 * bounds (multi-value header, oversize, weird chars) is dropped in favour of a
 * fresh UUID — avoids log injection via CRLF/control chars, log inflation via
 * multi-KB IDs, and correlation-hijacking by controlling other tenants' IDs.
 */
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

function pickRequestId(rawHeader: string | string[] | undefined): string {
  if (typeof rawHeader === 'string' && VALID_REQUEST_ID.test(rawHeader)) {
    return rawHeader;
  }
  return randomUUID();
}

export const requestContextPlugin = fp((fastify: FastifyInstance, _opts, done) => {
  fastify.addHook('onRequest', (req, reply, next) => {
    const requestId = pickRequestId(req.headers['x-request-id']);
    reply.header('x-request-id', requestId);
    runWithContext({ requestId }, () => next());
  });
  done();
});
