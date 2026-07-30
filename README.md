# Weather Activity Ranker

Type a city — get a 7-day desirability score for **skiing**, **surfing**, **outdoor sightseeing** and **indoor sightseeing**, grounded in real weather + marine + air-quality data.

> **Live demo:** _pending first deploy (Fly.io) — update after `fly launch`_
>
> Backend, frontend and contracts in one repo. TypeScript strict everywhere. Backend serves the SPA in prod (single-container).

**Stack**

- **Backend** — TypeScript · Node 22 · Fastify 5 · Apollo Server 5 · Pothos (code-first GraphQL) · Zod · Pino · LRU cache · `undici` · `p-limit` · `graphql-armor` (`max-depth` + `max-aliases`) · `@anthropic-ai/sdk` (Claude Haiku, opt-in)
- **Frontend** — React 19 · Vite 6 · Apollo Client 3 · React Router 8 · Tailwind CSS v4 · Motion · Paper Shaders · cmdk · Meteocons (via `@iconify/react`) · `@number-flow/react` · `react-error-boundary` · `@phosphor-icons/react`
- **Tests** — Jest 30 (`@swc/jest`) · fast-check · `undici.MockAgent` · React Testing Library + `jest-dom` (jsdom) · Playwright + axe-core · Pact V3
- **Tooling & infra** — pnpm 10 workspaces · Biome (lint + format) · GraphQL Codegen (client preset + fragment masking) · `tsx` (dev) · multi-stage Docker · Fly.io · GitHub Actions

**Contents**

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Claude Haiku implementation](#claude-haiku-implementation)
- [AI-augmented workflow](#ai-augmented-workflow)
- [Repository map](#repository-map)

---

## What it does

Same query, four flavours of answer depending on the city:

| Try | You get |
|---|---|
| `Ericeira` | Coastal Portugal — Surf leads (low 80s), Outdoor close behind. |
| `Chamonix` | Alpine, mid-summer — Outdoor tops the ranking, Ski scores low (no fresh snow), Surf renders as **Not Applicable** (no coastal data). |
| `Springfield` | Ambiguity picker: 3 US candidates, arrow keys to pick, `Enter` loads it. |
| `Barcelona` | Outdoor sightseeing wins mid-week. Editorial one-line summary via Claude Haiku when `ANTHROPIC_API_KEY` is set. |

Every day card shows the WMO icon, min/max temp, and a click expands into a full `DayDetail` overlay with the score breakdown (which factor contributed how much, weight and all). `⌘K` anywhere opens a full-screen palette with recent cities, popular chips, and live geocode search.

## Architecture

```
┌── React SPA ────────────────────────────────┐         ┌── Node backend ─────────────┐
│  features/ranking (Suspense + fragments)    │         │  domain/scoring (pure)      │
│     ↓                                       │         │     ↑                       │
│  Apollo Client 3 (typePolicies keyed by     │         │  application/use case       │
│      args, errorPolicy: default)            │  HTTP   │     ↑                       │
│     ↓                                       │  ───→   │  ports  ←→  adapters:       │
│  GraphQL over HTTP  ────────────────────────┼─────────┤     • Open-Meteo (weather,  │
│                                             │         │       geocoding, marine, AQI)│
│  contracts/schema.graphql  (single SDL,     │         │     • LRU cache decorator    │
│  emitted from Pothos, git-committed,        │         │     • Claude Haiku summariser│
│  drives frontend codegen)                   │         │     • System clock           │
└─────────────────────────────────────────────┘         └──────────────────────────────┘
```

- **Hexagonal / ports-and-adapters** — the domain doesn't know Fastify, Apollo, Open-Meteo or Node's `fetch` exists. All I/O is behind ports implemented by adapters, wired manually in [`composition-root.ts`](packages/server/src/composition-root.ts).
- **Strategy pattern for scoring** — one `ActivityScorer` per activity, registered in `ScorerRegistry`. Adding a fifth activity is a single file + one registry line.
- **Errors as data, not exceptions** — the top-level query returns `ActivityRankings | CityNotFoundError | AmbiguousLocationError | UpstreamUnavailableError`. The frontend `switch`es on `__typename` with an `assertNever` at the end so adding a fifth union member is a compile-time error at every render site.
- **Partial-failure semantics** — marine + AQI are advisory. If marine returns 400 for an inland city, surfing renders as `NotApplicable` and the other three activities still score. Never a whole-response failure because one upstream flaked.
- **Contract-first frontend** — `@wa/contracts` holds a checked-in `schema.graphql` (emitted from Pothos). Frontend runs `graphql-codegen` with the client preset + fragment masking against that SDL; each component declares only the fragment it reads, so refactors are safe.
- **Deterministic offline mode** — `OPEN_METEO_MODE=stub` swaps every upstream adapter for a fixture-backed stub. Playwright E2E and local demos use this — no rate-limit risk, no network flake.

More depth in [`specs/`](specs/) (9 formal specs — architecture, domain, scoring, adapters, GraphQL schema, frontend, testing, UI/UX, use case).

## Getting started

```bash
# Requirements: Node 22, pnpm 10. Use mise (.mise.toml is checked in) or:
nvm use 22 && npm i -g pnpm@10

pnpm install
pnpm --filter @wa/server build:schema      # emit contracts/schema.graphql
pnpm --filter @wa/contracts codegen        # generate typed frontend gql
pnpm dev                                   # backend :4000 + frontend :5173
```

Open http://localhost:5173. Try `Ericeira`, `Chamonix`, `Springfield`, or hit `⌘K` for the command palette.

### Offline mode (deterministic — used by Playwright and demos)

```bash
OPEN_METEO_MODE=stub pnpm --filter @wa/server dev
pnpm --filter @wa/web dev
```

### Environment (all optional — safe defaults)

Copy [`.env.example`](.env.example) → `.env`. Notable knobs:

| Var | Default | Purpose |
|---|---|---|
| `OPEN_METEO_MODE` | `live` | `stub` = deterministic offline fixtures |
| `ANTHROPIC_API_KEY` | *(unset)* | Enables Claude Haiku summaries; unset = template fallback |
| `SUMMARIZER_DAILY_CAP` | `100` | Kill switch: max successful Haiku calls per UTC day (resets at UTC midnight) |
| `LOG_LEVEL` | `info` | Pino level (`silent` in tests) |
| `RATE_LIMIT_MAX` | `60` | Requests per `RATE_LIMIT_WINDOW_MS` per IP |

Full registry in [specs/00-overview.spec.md](specs/00-overview.spec.md#environment-variable-registry).

## Testing

Layered pyramid — pure logic gets a high bar (property-based tests on the scoring maths), integrations get a realistic one, one Playwright per critical journey.

| Layer | Runner | What it covers |
|---|---|---|
| Domain + scoring (backend) | Jest + `fast-check` | Bell/ramp maths, per-scorer bounds & monotonicity, `weightedSum` invariants |
| Adapters (backend) | Jest + `undici.MockAgent` | Each Open-Meteo endpoint, HTTP mocked |
| Use case (backend) | Jest + real ports | Happy path, partial failure, ambiguity, upstream down, city not found |
| Utilities + components (frontend) | Jest + React Testing Library + jsdom | Format helpers, palette / weather-icon / suggested-cities, pure presentational components |
| Contract | `@pact-foundation/pact` V3 | Consumer (frontend) generates pact JSON; provider (backend) verifies in-process against real Fastify + Apollo |
| E2E | Playwright | Search, ambiguity, deep-link, activity switch, partial failure |
| a11y | `@axe-core/playwright` | Zero critical/serious violations on landing + ranking pages |

~215 backend tests + ~50 frontend unit tests (Jest, both <2 s) + 8 Playwright specs (6 functional + 2 a11y).

```bash
pnpm --filter @wa/server test              # backend suite
pnpm --filter @wa/web test                 # frontend unit + Pact consumer
pnpm --filter @wa/server test -- tests/pact/verify.test.ts   # verifies the pact
pnpm --filter @wa/web test:e2e             # Playwright + axe-core
```

Coverage thresholds in [`packages/server/jest.config.ts`](packages/server/jest.config.ts): 95% on scoring, 85% on adapters, 80% global. Full philosophy in [specs/06-testing-strategy.spec.md](specs/06-testing-strategy.spec.md).

## Deployment

Single-container: backend serves the built SPA when `NODE_ENV=production` via `fastify-static`.

**Docker**

```bash
docker build -t wa .
docker run -p 8080:8080 -e OPEN_METEO_MODE=stub wa
```

**Fly.io** — [`fly.toml`](fly.toml) targets the `gru` (São Paulo) region on `shared-cpu-1x` / 512 MB. Auto-stops on idle to fit the free tier (~1s cold start).

```bash
fly launch --copy-config --no-deploy
fly secrets set ANTHROPIC_API_KEY=sk-ant-…     # optional
fly deploy
```

**CI** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs 3 jobs on every PR: `quality` (typecheck, lint, unit tests, Pact roundtrip), `e2e` (Playwright + axe-core), `build` (full production build).

## Security

Concrete controls that ship with the app. Each has a real reason it's there — no theatre.

- **CSP + hardened headers (Helmet)** — narrow allowlist: `default-src 'self'`, `img-src 'self' data:`, `script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`. `style-src` allows `'unsafe-inline'` because Tailwind v4's runtime injects inline `<style>` tags. Any future third-party endpoint has to make it into the allowlist explicitly. See [main.ts](packages/server/src/main.ts).
- **CORS Zod-validated at boot** — origin list parsed at startup (absolute URLs only, no `*`); `filter(Boolean)` drops empty entries from `"a,,b"`. `credentials: false` is pinned so a future contributor flipping it on has to consciously address the CSRF surface. In prod the SPA is same-origin with `/graphql` so CORS is mostly defensive; in dev it lets Vite (:5173) talk to Fastify (:4000).
- **Per-IP rate limiting** — `@fastify/rate-limit` at 60 req / 60 s window (env-configurable). `/health` opts out per-route so K8s / Fly probes never get 429'd.
- **GraphQL DoS caps (graphql-armor)** — `maxDepthRule({ n: 10, flattenFragments: true })` blocks fragment-expansion depth bombs; `maxAliasesRule({ n: 5 })` blocks alias-based fanout amplification (one 60-alias query would otherwise fan out to 60 upstream Open-Meteo calls). Regression tests in [graphql-armor.test.ts](packages/server/src/adapters/inbound/graphql/graphql-armor.test.ts) so a future cap loosening is a conscious act.
- **GraphQL introspection off in prod** — opt-in via `EXPOSE_INTROSPECTION`. The Apollo landing page is also disabled in prod (its default page loads CDN scripts that our CSP blocks; the SDL is checked into `packages/contracts/schema.graphql` for anyone who needs it).
- **Error sanitisation at the GraphQL boundary** — in prod, `formatError` reduces `extensions` to `{ code, requestId }` only. Prevents leaking Zod issue trees, upstream response body slices, or other keys library-thrown `GraphQLError`s can carry. Stacktraces are already scrubbed by Apollo Server 5 in prod. Dev keeps everything for debuggability.
- **Request-ID hardening (log-injection guard)** — client-supplied `x-request-id` accepted only if it matches `^[A-Za-z0-9._-]{1,64}$`; anything else (CRLF, multi-value header, multi-KB payload) is dropped in favour of a fresh UUID. Prevents log injection, log inflation, and correlation hijacking. See [request-context.ts](packages/server/src/infrastructure/request-context.ts).
- **Fail-fast env validation** — every env var goes through a Zod schema at boot. Invalid config crashes the process with a clear error instead of silently defaulting.
- **AI-cost containment** — `ANTHROPIC_API_KEY` is opt-in; unset means the deterministic template fallback ships. When set: `$2/mo` hard cap in the Anthropic console, `SUMMARIZER_DAILY_CAP=100` kill switch (resets at UTC midnight), 3 s wall-clock timeout with `maxRetries: 0`, 30-min per-city cache. Full breakdown in [Claude Haiku implementation](#claude-haiku-implementation). Failing loudly is fine; a $10k surprise bill is not.
- **Container hardening** — multi-stage Docker with pruned production deps in the runtime image; runs as non-root user `app`. Body limit set on Fastify so a single request can't OOM the container.
- **No secrets in the repo** — `.env` git-ignored; `ANTHROPIC_API_KEY` provisioned to Fly via `fly secrets set`; CI reads from GitHub secrets.

## Claude Haiku implementation

An optional one-sentence editorial summary appears on the ranking page ("*This week Barcelona is best for outdoor sightseeing on Wed; skip surfing — swell flat.*") when `ANTHROPIC_API_KEY` is set. Without a key, a deterministic template summariser runs — the app is fully functional with zero AI dependency.

**What runs on each call** — [claude-haiku-summarizer.ts](packages/server/src/adapters/outbound/summarizer/claude-haiku-summarizer.ts)

- **Model**: `claude-haiku-4-5` (smallest / cheapest / fastest tier).
- **Endpoint**: `messages.create`, `max_tokens: 100` (one sentence, no lists, no headers).
- **System prompt**: ~65-token instruction ("concise travel weather assistant … one sentence"). Marked cacheable with `cache_control: 'ephemeral'` — a nudge for when the prompt grows past the 1024-token cache-write threshold (today it's a no-op).
- **User prompt**: city + timezone + 4 activity rankings with best-day dates and scores → roughly 150–200 input tokens.

**Cost per call** (Anthropic public pricing for `claude-haiku-4-5`, as of writing: $1.00 / 1M input tokens · $5.00 / 1M output tokens)

| | Tokens | Rate | Cost |
|---|---|---|---|
| Input (system + user) | ~250 | $1.00 / 1M | $0.00025 |
| Output (capped) | ≤100 | $5.00 / 1M | ≤$0.0005 |
| **Total per call** | | | **≈ $0.00075** (< 0.1 ¢) |

**Limits + kill switches** (defence in depth — any one of these is enough to prevent a runaway bill)

- **Hard cap: $2 / month** set on the Anthropic workspace via the console. This is the absolute ceiling; when it's reached, the SDK returns 429 and the summariser falls back to the template. No over-run is possible.
- **Daily quota**: `SUMMARIZER_DAILY_CAP=100` successful calls per UTC day (env-configurable). At ≈ $0.00075/call this maxes out at ~$0.075/day (~$2.25/mo sustained), so the daily quota and the console cap intersect at roughly the same ceiling.
- **Errors don't chew the budget**: only *successful* calls increment the counter, so a flaky day of upstream errors doesn't consume the daily quota. Verified by a dedicated test in [claude-haiku-summarizer.test.ts](packages/server/src/adapters/outbound/summarizer/claude-haiku-summarizer.test.ts).
- **Timeout**: 3 s wall-clock (`Promise.race`) around the SDK call, backed by a 5 s SDK-level timeout — belt-and-braces so a hung TCP socket can't stall the GraphQL request.
- **No retries**: `maxRetries: 0` on the Anthropic SDK client. One shot, then fallback. Retrying on a 5xx would just re-hit the same failing upstream and burn budget.
- **Per-city cache**: the whole `activityRankings` result (including the summary) is cached for 30 min per city + activity set. Most repeat views cost $0.

**Fallback chain** (the port contract says `summarize` NEVER throws)

1. Try Claude Haiku (with the guards above).
2. Any failure — error, timeout, empty response, or cap hit — falls through to the deterministic **template summariser**: a rule-based one-liner assembled from the same ranking data. No AI, no network, no cost.
3. Belt-and-braces `safeFallback` wraps *even the template*: if the fallback itself throws (a bug or contract violation), a static literal (`"Weather forecast for <City>."`) is returned. GraphQL request always gets a string.

**Secret handling**

- `ANTHROPIC_API_KEY` is opt-in via env; unset ⇒ template summariser only. No key in the repo. `.env` is git-ignored and `.env.example` documents the variable with an empty value.
- In prod the key is provisioned via `fly secrets set ANTHROPIC_API_KEY=…` — never in `fly.toml` or the Docker image.
- CI runs without a key (Playwright + Pact use the stub Open-Meteo mode and the template summariser).

## AI-augmented workflow

Spec-driven (write the spec, review it, ask AI for a plan, execute, review every file, verify with tests). Explicit rejections and where AI's default was wrong for this context in [AI_ASSIST.md](AI_ASSIST.md).

## Repository map

```
├── specs/                      # 9 formal specs — architecture through use case
├── research/                   # 6 pre-planning research reports (sub-agent output)
├── packages/
│   ├── contracts/              # schema.graphql (emitted from Pothos) + codegen config
│   ├── server/                 # Node backend (hexagonal)
│   │   ├── src/
│   │   │   ├── domain/         # Pure business logic — no I/O, no deps
│   │   │   ├── ports/          # Interfaces the domain calls
│   │   │   ├── adapters/       # Open-Meteo, cache, summarizer, clock, inbound GraphQL
│   │   │   ├── application/    # Use cases
│   │   │   ├── infrastructure/ # env, logger, rate-limit, http, request-context
│   │   │   ├── composition-root.ts
│   │   │   └── main.ts         # Fastify bootstrap
│   │   └── tests/              # Test doubles, MockAgent helper, Pact provider verify
│   └── web/                    # React SPA (feature-based)
│       ├── src/
│       │   ├── app/            # providers, routes, main
│       │   ├── features/
│       │   │   ├── landing/    # LandingPage, HowItWorks, DataStats, RecentCities, SampleSummary
│       │   │   └── ranking/    # RankingPage, DayCard, DayDetail, ActivitySwitcher,
│       │   │                   #   ForecastStrip, AmbiguityPicker, CommandPalette (⌘K)
│       │   ├── components/     # Logo, background/ActivityShader
│       │   ├── lib/            # apollo, env, palette, format, weather-icon
│       │   ├── gql/            # graphql-codegen output (git-ignored)
│       │   └── styles/         # Tailwind v4 @theme with OKLCH tokens
│       └── e2e/                # Playwright + axe-core
├── Dockerfile                  # multi-stage single-container (backend serves SPA)
├── fly.toml
└── .github/workflows/ci.yml
```

---

## License

MIT — see [LICENSE](LICENSE). Weather data by [Open-Meteo](https://open-meteo.com/) · CC-BY 4.0.
