import { type Logger, pino } from 'pino';
import type { ServerEnv } from './env.js';

/**
 * Pino root logger.
 *
 * - `service` + `env` fields on every line so a centralized log store (DataDog,
 *   Loki) can filter by them.
 * - Dev: pretty output with ISO timestamps for readability during local runs.
 * - Prod: default JSON output (structured, one line per event, ready for a
 *   log-collection agent).
 * - Redacts headers that could leak secrets or PII (defensive — we don't set
 *   these ourselves, but they can arrive from clients or intermediaries):
 *     - `authorization` / `x-api-key` / `proxy-authorization` — credentials
 *     - `cookie` / `set-cookie` — session tokens if we ever add them
 *     - `x-forwarded-for` — client IPs (GDPR-adjacent)
 *   Also redacts `err.cause.response.body` where Anthropic/Open-Meteo error
 *   payloads can echo user input back.
 *
 * See specs/04-graphql-schema.spec.md §Fastify server layout, spec 00 §Env registry.
 */

export type { Logger };

export function createLogger(env: ServerEnv): Logger {
  const isDev = env.NODE_ENV === 'development';
  return pino({
    level: env.LOG_LEVEL,
    base: { service: 'weather-activities', env: env.NODE_ENV },
    redact: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers["proxy-authorization"]',
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      'req.headers["x-forwarded-for"]',
      'err.cause.response.body',
    ],
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss.l',
              ignore: 'pid,hostname,service,env',
            },
          },
        }
      : {}),
  });
}
