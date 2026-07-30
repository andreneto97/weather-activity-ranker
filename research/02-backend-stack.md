# Backend Stack — Best Practices (2026)

TypeScript + Node.js + GraphQL for the weather activity scoring service.

---

## Executive TL;DR (the stack to ship)

| Concern | Pick | Why (one line) |
|---|---|---|
| Runtime | **Node 22+ (ESM)** | LTS, native fetch, native `--watch`, first-class ESM |
| GraphQL server | **GraphQL Yoga** | Spec-compliant, Envelop plugins, faster, less lock-in than Apollo |
| Schema builder | **Pothos** (code-first) | Best-in-class TS inference; used at Airbnb/Netflix |
| Language tooling | **tsx** (dev) + **tsc --noEmit** (typecheck) + **tsc** (build) | Boring, fast, zero magic |
| Package manager | **pnpm** with workspaces | Correctness (no phantom deps), first-class workspace protocol |
| Linter/formatter | **Biome** | One config, one binary, 10–25× faster |
| HTTP client | **native `fetch`** (undici under the hood) | Zero deps, idiomatic 2026 |
| Cache | **`lru-cache` v11** | Industry standard; TTL + max size |
| Validation | **Zod v4** | Runtime + inferred TS types at the edge |
| DI | **Manual composition root** (`src/composition.ts`) | Right size for the problem |
| Logger | **Pino** with child loggers per request | Fastest, structured JSON, OTel-friendly |
| Errors | **Errors-as-data** for domain errors (union result types); GraphQL `errors[]` only for infra | Shopify-grade pattern |
| Architecture | **Hexagonal**: `domain` / `application` / `adapters` / `interfaces` | Clean without ceremony |
| Scoring | **Strategy pattern**: `ActivityScorer` interface, one pure module per activity | Testable, extensible |

---

## 1) GraphQL Server Choice

### Landscape (weekly downloads, npmtrends 2026)
- **GraphQL Yoga** — ~627k/wk. Framework-agnostic, W3C Request/Response, Envelop plugin system, runs on Node/Bun/Deno/Workers.
- **Apollo Server 5** — ~216k/wk. Apollo 4 hit EOL Jan 26 2026. Requires Node ≥20. Larger footprint; pushes you toward Apollo's managed ecosystem.
- **Mercurius** — ~94k/wk. Fastify-native. Only if already on Fastify.
- **Pothos** — schema builder, not a server. Composes with any of the above.
- **TypeGraphQL** — decorators + `reflect-metadata`. Fading.

### Recommendation: **GraphQL Yoga + Pothos**
**Why:**
- Yoga is **spec-compliant with GraphQL-over-HTTP**; Apollo 5 still isn't fully compliant.
- Built on `Request`/`Response` primitives — deployable to Node, Bun, Workers with no code change.
- **Envelop** plugin pipeline gives you response caching, rate-limit, persisted operations, tracing.
- Zero lock-in; Apollo increasingly steers you into paid GraphOS.

---

## 2) Schema-First vs Code-First

**Code-first has won for TypeScript-native services.** Reasons:
- Single source of truth (the code) — no drift between SDL + resolvers + types.
- No codegen step in the dev loop.
- Refactor-safe: rename a field and TypeScript tells you every resolver that broke.

### Recommendation: **Code-first with Pothos**
- Zero runtime overhead, single dep on `graphql`.
- Type inference from the builder — no decorators, no `reflect-metadata`, no codegen.
- Backing-model separation maps cleanly to hexagonal domain models.
- **Emit an SDL file at build time** (`printSchema(builder.toSchema())` → `schema.graphql`) so you get code-first ergonomics *and* schema-first artifacts.

---

## 3) Node.js Project Structure — Hexagonal

### Recommended layout
```
weather-activities/
├── package.json
├── tsconfig.json
├── biome.json
├── schema.graphql              # generated from Pothos on build (committed for review)
└── src/
    ├── domain/                 # pure, framework-free, no I/O
    │   ├── activity.ts
    │   ├── daily-weather.ts
    │   └── score.ts
    │
    ├── scoring/                # STRATEGY PATTERN — one file per activity
    │   ├── activity-scorer.ts  # interface
    │   ├── skiing.ts
    │   ├── surfing.ts
    │   ├── outdoor-sightseeing.ts
    │   ├── indoor-sightseeing.ts
    │   └── registry.ts
    │
    ├── application/            # use cases — orchestrates ports; no framework code
    │   └── rank-week.ts
    │
    ├── ports/                  # interfaces the application depends on
    │   ├── weather-provider.ts
    │   ├── geocoder.ts
    │   └── clock.ts
    │
    ├── adapters/               # concrete port implementations
    │   ├── open-meteo/
    │   │   ├── geocoder.ts
    │   │   ├── weather.ts
    │   │   └── dto.ts          # Zod schemas + mappers
    │   └── cache/
    │       └── lru-cached.ts   # decorator wrapping WeatherProvider
    │
    ├── interfaces/graphql/     # transport layer
    │   ├── builder.ts
    │   ├── types/
    │   ├── queries/
    │   └── context.ts
    │
    ├── infrastructure/
    │   ├── logger.ts           # pino
    │   └── http.ts             # fetch wrapper w/ timeout
    │
    ├── composition.ts          # THE composition root — manual DI
    └── server.ts               # createYoga + node:http listen
```

### Why this signals senior
- **Direction of dependencies is one-way**: `interfaces → application → domain`. Adapters also depend inward on `ports`.
- **`domain` and `scoring` have zero framework imports** — trivially portable to CLI, Lambda, worker.
- **`ports/` folder** cues Dependency Inversion.
- **`composition.ts` is your DI**: one file, plain functions, no decorators.
- **`cache/lru-cached.ts` wrapper** is the **Decorator pattern** applied to a port.

### DI recommendation: **Manual composition root**
```ts
// composition.ts
export function buildContainer(logger = createLogger()) {
  const http = createHttpClient({ timeoutMs: 3000 });
  const geocoder = createOpenMeteoGeocoder(http);
  const weather = withLruCache(createOpenMeteoWeather(http), { ttlMs: 10 * 60_000, max: 500 });
  const scorers = createScorerRegistry();
  const rankWeek = makeRankWeek({ geocoder, weather, scorers, logger });
  return { logger, rankWeek };
}
```

For a larger app, **Awilix** (functional, no decorators) is the right progression.

---

## 4) TypeScript Config — Node 22 + ESM

```jsonc
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    "strict": true,
    "noUncheckedIndexedAccess": true,      // biggest safety win
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedSideEffectImports": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,

    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,

    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "sourceMap": true,
    "incremental": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
```

**Flags worth calling out:**
- `noUncheckedIndexedAccess` — one flag that meaningfully changes how you write code.
- `exactOptionalPropertyTypes` — "undefined vs missing" distinction.
- `verbatimModuleSyntax` — proves you understand ESM/CJS erasure semantics.
- `isolatedModules` — signals awareness that tsc is one of several tools.

---

## 5) Package Manager & Tooling

### Package manager: **pnpm**
- **No phantom dependencies** (strict hoisting).
- First-class `workspace:*` protocol for shared types package.
- Bun installs faster but uses flat `node_modules` (phantom-dep risk).
- **The soundbite**: "Bun is fast, pnpm is correct."

### Monorepo layout
```
pnpm-workspace.yaml
packages/
  api/              # this GraphQL service
  web/              # frontend
  shared/           # shared TS types + Zod schemas
```

### Dev + build tooling
| Job | Pick | Why |
|---|---|---|
| Dev runner | **`tsx watch src/server.ts`** | esbuild-backed, 200–400ms restarts |
| Type check | **`tsc --noEmit`** | Only reliable source of type truth |
| Production build | **`tsc`** | Service output, no bundle needed |
| Test | **Vitest** or **Jest** (match their stack) | See testing doc |

### Linter/formatter: **Biome**
- One `biome.json`, one binary, one command.
- 10–25× faster than ESLint+Prettier.

---

## 6) HTTP Client — **native `fetch`**

Node 22's `fetch` is powered by **undici**. Native `fetch` + `AbortController` is idiomatic 2026.

```ts
// src/infrastructure/http.ts
export function createHttpClient({ timeoutMs = 3000 } = {}) {
  return async function httpJson<T>(url: string): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new UpstreamError(`Open-Meteo ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(t);
    }
  };
}
```

**Avoid `axios`** — March 2026 supply-chain compromise (v1.14.1, v0.30.4) is fresh news.

### Retry pattern
`p-retry` around fetch, 3 attempts + exp backoff, only retrying on 5xx/429 and `AbortError` from timeout — not on 4xx.

---

## 7) Caching — **`lru-cache` v11**

```ts
// src/adapters/cache/lru-cached.ts
import { LRUCache } from 'lru-cache';
import type { WeatherProvider } from '../../ports/weather-provider.js';

export function withLruCache(
  inner: WeatherProvider,
  opts: { ttlMs: number; max: number },
): WeatherProvider {
  const cache = new LRUCache<string, DailyWeather[]>({ max: opts.max, ttl: opts.ttlMs });
  return {
    async forecast(lat, lon) {
      const key = `${lat.toFixed(3)}:${lon.toFixed(3)}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const fresh = await inner.forecast(lat, lon);
      cache.set(key, fresh);
      return fresh;
    },
  };
}
```

**Also cache geocoding** (city → lat/lon) — static enough for hours, and separate upstream call.

If persistence needed, swap to `keyv` (single API over Redis/etcd/etc) behind the same port.

---

## 8) Error Handling — **Errors-as-Data (union result types)**

Domain errors go into the schema; only infrastructure faults surface via top-level `errors[]`.

```graphql
interface DomainError {
  message: String!
  code: String!
}

type CityNotFoundError implements DomainError {
  message: String!
  code: String!
  query: String!
}

type UpstreamUnavailableError implements DomainError {
  message: String!
  code: String!
  provider: String!
}

type ActivityRanking {
  city: City!
  days: [DailyActivityScore!]!
}

union ActivityRankingResult = ActivityRanking | CityNotFoundError | UpstreamUnavailableError

type Query {
  activityRanking(city: String!, activity: ActivityKind): ActivityRankingResult!
}
```

**Why senior**: client renders "City not found" without pattern-matching on error strings; API is self-documenting; `DomainError` interface lets clients write one fallback fragment. Shopify/GitHub playbook.

**Reserve `throw` for the truly exceptional** — DB down, upstream 500, bug. Those become GraphQL `errors[]` via Yoga's `useMaskedErrors`.

---

## 9) Observability

### Logger: **Pino** (child loggers per request)
```ts
import { pino } from 'pino';
export const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization'],
  base: { service: 'weather-activities', env: process.env.NODE_ENV },
});
```

### Request-scoped logging in Yoga
Use `onRequest` plugin to generate `requestId`, create child logger, attach to context.

### For prod
- **OpenTelemetry**: `@opentelemetry/instrumentation-pino` auto-injects `traceId`/`spanId`. Envelop has `useOpenTelemetry`.
- **Metrics**: Prom-client counters for `graphql_request_total{operation, status}`.

---

## 10) Validation — **Zod v4 at every boundary**

Zod solves three problems:
1. Runtime validation of Open-Meteo responses.
2. Type inference — `z.infer<typeof Schema>` gives TS type for free.
3. Input validation of GraphQL args.

```ts
export const ForecastResponse = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_sum: z.array(z.number()),
    snowfall_sum: z.array(z.number()),
    windspeed_10m_max: z.array(z.number()),
    cloudcover_mean: z.array(z.number()),
    uv_index_max: z.array(z.number()),
  }),
});

export function toDomain(dto: z.infer<typeof ForecastResponse>): DailyWeather[] { /* ... */ }
```

Put Zod schemas in `packages/shared/` so the frontend can reuse them for form inputs.

---

## 11) Ranking Algorithm Design

**Most-scored section.** Reviewer wants:
1. A **normalized domain type** independent of Open-Meteo.
2. Pure functions (`(DailyWeather) => Score`).
3. **Strategy pattern** so adding an activity = adding one file.
4. **Explainability** — return score AND reasons.
5. **Config-driven weights**.

### Domain model
```ts
export type DailyWeather = Readonly<{
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipMm: number;
  snowfallCm: number;
  windKph: number;
  cloudCoverPct: number;
  uvIndexMax: number;
  waveHeightM?: number;
}>;

export type Score = Readonly<{
  value: number;                // 0..100
  reasons: readonly string[];
}>;
```

### Strategy interface
```ts
export type ActivityKind = 'SKIING' | 'SURFING' | 'OUTDOOR_SIGHTSEEING' | 'INDOOR_SIGHTSEEING';

export interface ActivityScorer {
  readonly kind: ActivityKind;
  score(day: DailyWeather): Score;
}
```

### Piecewise linear "goodness" functions
Express each weather variable's contribution as a curve `[0..1]`, then combine with weights that sum to 1.

```ts
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const bell = (x: number, good: number, ideal: number, bad: number): number => {
  if (x <= bad || x >= 2 * ideal - bad) return 0;
  if (x >= good && x <= 2 * ideal - good) return 1;
  return clamp01(1 - Math.abs(x - ideal) / (ideal - bad));
};

export const weightedSum = (parts: ReadonlyArray<[label: string, weight: number, value01: number]>): Score => {
  const total = parts.reduce((s, [, w, v]) => s + w * v, 0);
  const reasons = parts
    .filter(([, w]) => w > 0)
    .map(([label, w, v]) => `${label}: ${(v * 100).toFixed(0)}% (w=${w})`);
  return { value: Math.round(clamp01(total) * 100), reasons };
};
```

### Example: skiing
```ts
export const skiingScorer: ActivityScorer = {
  kind: 'SKIING',
  score(day) {
    return weightedSum([
      ['fresh snow',      0.4, bell(day.snowfallCm, 2, 20, 0)],
      ['cold enough',     0.3, bell(day.tempMaxC, -20, -3, 5)],
      ['low wind',        0.2, bell(day.windKph, 0, 5, 40)],
      ['visibility',      0.1, 1 - clamp01(day.cloudCoverPct / 100 * 0.5)],
    ]);
  },
};
```

### Example: indoor sightseeing (trick question)
Rewards *bad* outdoor weather — shows you thought about the domain.

```ts
export const indoorSightseeingScorer: ActivityScorer = {
  kind: 'INDOOR_SIGHTSEEING',
  score(day) {
    return weightedSum([
      ['rainy',           0.5, clamp01(day.precipMm / 10)],
      ['cold or hot',     0.3, 1 - bell(day.tempMaxC, 12, 22, -10)],
      ['overcast',        0.2, clamp01(day.cloudCoverPct / 100)],
    ]);
  },
};
```

### Registry
```ts
export function createScorerRegistry(): ReadonlyMap<ActivityKind, ActivityScorer> {
  return new Map<ActivityKind, ActivityScorer>([
    ['SKIING',              skiingScorer],
    ['SURFING',             surfingScorer],
    ['OUTDOOR_SIGHTSEEING', outdoorSightseeingScorer],
    ['INDOOR_SIGHTSEEING',  indoorSightseeingScorer],
  ]);
}
```

---

## Package.json

```json
{
  "name": "weather-activities",
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@pothos/core": "^4",
    "graphql": "^16",
    "graphql-yoga": "^5",
    "lru-cache": "^11",
    "pino": "^9",
    "zod": "^4"
  },
  "devDependencies": {
    "@biomejs/biome": "^1",
    "@types/node": "^22",
    "tsx": "^4",
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

---

## Sources
- https://the-guild.dev/graphql/yoga-server/docs/comparison
- https://pothos-graphql.dev/
- https://github.com/tsconfig/bases/blob/main/bases/node22.json
- https://www.apollographql.com/docs/graphos/schema-design/guides/errors-as-data-explained
- https://graphql.wtf/episodes/30-graphql-error-handling-with-union-types
