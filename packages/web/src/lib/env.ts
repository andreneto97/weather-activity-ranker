import { z } from 'zod';

/**
 * Frontend env schema. Only VITE_-prefixed vars are exposed to the browser;
 * Vite bakes their values at build time. Fails fast at boot with a readable
 * error if misconfigured.
 *
 * See specs/00-overview.spec.md §Environment variable registry.
 */

// VITE_GRAPHQL_ENDPOINT accepts either an absolute URL (dev pointing at
// localhost:4000/graphql) or a same-origin relative path (`/graphql` in prod).
// z.url() rejects relative paths, so we use z.string().min(1) with a permissive
// check.
const EnvSchema = z.object({
  VITE_GRAPHQL_ENDPOINT: z.string().min(1).optional(),
  VITE_UNITS_DEFAULT: z.enum(['metric', 'imperial']).default('metric'),
});

export const env = EnvSchema.parse(import.meta.env);
export type WebEnv = z.infer<typeof EnvSchema>;
