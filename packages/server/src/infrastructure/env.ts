import { z } from 'zod';

/**
 * Server-side environment schema. Zod-validated at boot in main.ts — fails
 * fast with a readable error if misconfigured, rather than surfacing bizarre
 * runtime bugs later.
 *
 * See specs/00-overview.spec.md §Environment variable registry for the
 * canonical documentation of every var (and `.env.example`).
 */

const numberFromEnv = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? defaultValue : Number(v)))
    .pipe(z.number().positive());

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  PORT: numberFromEnv(4000),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  // Comma-separated list of absolute origins allowed by the CORS layer.
  // Reject `*` explicitly — even though we don't use credentials, a wildcard
  // origin is almost never what a coastal deploy actually wants; catching a
  // misconfigured deploy at boot is cheaper than at first request.
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .refine(
      (raw) => {
        const parts = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length === 0) return false;
        return parts.every((entry) => entry !== '*' && URL.canParse(entry));
      },
      {
        message: 'must be a comma-separated list of absolute URLs (no wildcard "*")',
      },
    ),

  OPEN_METEO_MODE: z.enum(['live', 'stub']).default('live'),
  OPEN_METEO_TIMEOUT_MS: numberFromEnv(3000),

  CACHE_TTL_WEATHER_MS: numberFromEnv(30 * 60_000),
  CACHE_TTL_MARINE_MS: numberFromEnv(30 * 60_000),
  CACHE_TTL_AQI_MS: numberFromEnv(30 * 60_000),
  CACHE_TTL_GEOCODING_MS: numberFromEnv(24 * 60 * 60_000),

  RATE_LIMIT_MAX: numberFromEnv(60),
  RATE_LIMIT_WINDOW_MS: numberFromEnv(60_000),

  EXPOSE_INTROSPECTION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  SUMMARIZER_DAILY_CAP: numberFromEnv(100),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

/**
 * Parse `process.env` (or any Record) into a validated ServerEnv.
 * Throws a formatted error on failure — always callable at boot.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
