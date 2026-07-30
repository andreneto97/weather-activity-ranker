# 06 — Testing Strategy

## Purpose

Prove the system works via a layered test pyramid: pure unit tests where possible, integration tests at seams, one Playwright E2E per critical journey. Matches the JD's "TDD with Jest and Pact" (Pact intentionally deferred — see rejections).

## Runner: Jest 30 + `@swc/jest`

- Jest matches JD stack.
- `@swc/jest` transforms TS/JSX in tests — 3–5× faster than `ts-jest` — and skips in-test type checking (CI runs `tsc --noEmit` separately for that).
- `jest.config.ts` uses TypeScript directly; Jest 30 loads it via native ESM (no `ts-node`).
- ESM setup notes for `verbatimModuleSyntax` and `.ts` imports:
  - `extensionsToTreatAsEsm: ['.ts', '.tsx']`
  - `moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' }` (strips `.js` from relative imports so Jest resolves the corresponding `.ts` source)
  - `NODE_OPTIONS=--experimental-vm-modules` in the `test` script (still required in Node 22 for Jest ESM)

## Coverage thresholds (`jest.config.ts`)

```ts
coverageThreshold: {
  global:                           { lines: 80, functions: 80, branches: 75, statements: 80 },
  './src/domain/scoring/':          { lines: 95, functions: 95, branches: 90, statements: 95 },
  './src/adapters/outbound/':       { lines: 85, functions: 85, branches: 80, statements: 85 },
}
```

Rationale: pure logic gets a high bar; wiring code gets a realistic one; do not chase gamed 100 %.

## Property-based tests with `fast-check`

Applied to scorers and `util.ts`. Invariants asserted:

| Invariant | Where |
|---|---|
| `score.value ∈ [0, 100]` | every scorer |
| `score.value` is integer | every scorer |
| components sorted by weight desc | every scorer |
| `∑ weight ≤ 1 + ε` | every scorer |
| ski monotonicity in snowfall (within ideal range) | `ski-scorer.test.ts` |
| indoor monotonicity in precipitation prob. | `indoor-scorer.test.ts` |
| `bell(x, leftZero, ideal, rightZero) === 1` iff `x === ideal`; `=== 0` iff `x ≤ leftZero || x ≥ rightZero` | `util.test.ts` |
| `ramp(x, lo, hi)` monotonic non-decreasing | `util.test.ts` |
| `rampDown` inverse of `ramp` | `util.test.ts` |
| `weightedSum` idempotent under permutation | `util.test.ts` |

## File layout (co-located)

```
packages/server/
├── src/
│   ├── domain/scoring/
│   │   ├── util.ts
│   │   ├── util.test.ts
│   │   ├── ski-scorer.ts
│   │   ├── ski-scorer.test.ts
│   │   └── …
│   ├── adapters/outbound/open-meteo/
│   │   ├── dto.ts
│   │   ├── dto.test.ts
│   │   ├── mappers.ts
│   │   ├── mappers.test.ts
│   │   ├── weather.adapter.ts
│   │   ├── weather.adapter.test.ts       # uses undici MockAgent via mock-http.ts
│   │   ├── __fixtures__/*.json
│   │   └── …
│   ├── adapters/outbound/cache/
│   │   ├── lru-cached.ts
│   │   └── lru-cached.test.ts
│   ├── application/
│   │   ├── rank-activities.usecase.ts
│   │   ├── rank-activities.usecase.test.ts
│   │   ├── summarize-week.ts
│   │   └── summarize-week.test.ts        # fallback template when no API key
│   ├── adapters/inbound/graphql/
│   │   ├── resolvers.test.ts             # executable schema + stubbed use case
│   │   └── errors.test.ts
│   └── infrastructure/
│       ├── request-context.test.ts
│       └── rate-limit.test.ts
└── tests/
    ├── support/                          # shared fakes + factories
    │   ├── fake-clock.ts
    │   ├── in-memory-geocoding.ts
    │   ├── stub-weather.ts
    │   ├── stub-marine.ts
    │   ├── stub-air-quality.ts
    │   └── factories.ts                  # makeWeather({ overrides })
    └── integration/
        ├── rank-activities-happy.test.ts
        ├── rank-activities-not-found.test.ts
        ├── rank-activities-ambiguous.test.ts
        ├── rank-activities-upstream-down.test.ts
        ├── rank-activities-partial-fail.test.ts   # Marine down → Surfing=0
        └── rate-limit.test.ts
```

## Factories (`tests/support/factories.ts`)

```ts
export const makeDailyWeather = (
  overrides: Partial<DailyWeather> = {},
): DailyWeather => ({
  date: '2026-07-28',
  temperature: { minC: 12, maxC: 22 },
  apparentTempMaxC: 22,
  precipitationMm: 0,
  precipitationProbabilityMaxPct: 10,
  snowfallCm: 0,
  wind: { maxKmh: 8, gustsKmh: 12 },
  cloudCoverPct: 30,
  uvIndexMax: 5,
  sunshineHours: 8,
  weatherCode: 1,
  ...overrides,
});
```

Every test uses factories, never bare JSON blobs. Overrides are the only thing that matters to the assertion.

## Mocking strategy

| Layer | Tool | Note |
|---|---|---|
| Node outbound HTTP (Open-Meteo) | **`undici.MockAgent`** (Node 22 built-in) | Nock v13 doesn't intercept native `fetch()`; MockAgent does + is dep-free |
| Frontend fetch (component tests) | `msw` | `onUnhandledRequest: 'error'` |
| Playwright | Real backend + `undici.MockAgent`-intercepted upstream, OR `page.route()` for pure UI paths | See §Playwright |
| Time | `jest.useFakeTimers()` | For any test asserting `generatedAt` or cache TTL |

`jest.setup.ts` clears undici's global dispatcher between tests (via `resetMockHttp()` from `tests/support/mock-http.ts`) and asserts no interceptor was left unconsumed. `MockAgent.disableNetConnect()` is set on first use so accidentally-live tests fail loudly.

**Helper**: `tests/support/mock-http.ts` wraps MockAgent with a small ergonomic API:

```ts
import { mockHttp } from '../../tests/support/mock-http.js';

const { pool } = mockHttp('https://api.open-meteo.com');
pool.intercept({ path: '/v1/forecast', method: 'GET' }).reply(200, fixture);
```

## Integration tests

Wire the real use case + real Open-Meteo adapters + `mockHttp()` + fake clock + in-memory cache. Prove the whole vertical works.

Example (`rank-activities-happy.test.ts`):

```ts
it('ranks Lisbon for outdoor sightseeing', async () => {
  const { pool: geoPool } = mockHttp('https://geocoding-api.open-meteo.com');
  const { pool: fcPool } = mockHttp('https://api.open-meteo.com');
  const { pool: aqiPool } = mockHttp('https://air-quality-api.open-meteo.com');
  geoPool.intercept({ path: /^\/v1\/search/, method: 'GET' }).reply(200, geocodingLisbonFixture);
  fcPool.intercept({ path: /^\/v1\/forecast/, method: 'GET' }).reply(200, sunnyLisbonFixture);
  aqiPool.intercept({ path: /^\/v1\/air-quality/, method: 'GET' }).reply(200, cleanAirFixture);

  const container = buildContainer(testEnv, { clock: new FakeClock('2026-07-28') });
  const result = await container.rankActivities.execute({ cityQuery: 'Lisbon' });

  // Narrow the tagged union — Jest expect() does not narrow types.
  if (result.kind !== 'Ok') throw new Error(`expected Ok, got ${result.kind}`);
  const outdoor = result.rankings.find((r) => r.activity === 'OUTDOOR_SIGHTSEEING');
  if (!outdoor) throw new Error('outdoor ranking missing');
  expect(outdoor.overallScore).toBeGreaterThan(70);
  expect(outdoor.bestDay.date).toBe('2026-07-30');
});
```

**Note on union narrowing in tests**: because `RankingResult` is a discriminated union, `expect(result.kind).toBe('Ok')` does not narrow the type. Use plain `if (result.kind !== 'Ok') throw ...` guards — they narrow AND fail loud if the assumption is wrong. Same pattern applies to all integration tests that assert on `.rankings`.

## Partial failure test (critical)

`rank-activities-partial-fail.test.ts`:
- Chamonix + Surfing: geocoding + forecast succeed, Marine returns 400 `{"reason": "..."}`.
- Expect `RankingResult.Ok`, all 4 rankings present, `Surfing.overallScore === 0`, and `bestDay.score.components[0].label === 'No coastal access'`.

## Playwright (Chromium only)

Location: `packages/web/e2e/`

`playwright.config.ts`:
```ts
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'pnpm --filter @wa/server dev:mock', url: 'http://localhost:4000/health', reuseExistingServer: !process.env.CI },
    { command: 'pnpm --filter @wa/web dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
  ],
});
```

`dev:mock` runs the server with a stub Open-Meteo layer (env `OPEN_METEO_MODE=stub`) that reads from fixtures — makes E2E deterministic and offline.

### Test list

1. `happy-path.spec.ts` — type "Lisbon", see ranking with 4 activities, verify best day highlighted.
2. `city-not-found.spec.ts` — type "asdlkjhqwoieuh", see friendly error + retry.
3. `ambiguous-location.spec.ts` — type "Springfield", see picker with 5 candidates, click one, see ranking.
4. `activity-switch.spec.ts` — switch from Outdoor to Skiing, verify palette + best-day glow updates.
5. `deep-link.spec.ts` — navigate to `/city/Lisbon?activity=SURFING`, verify pre-selected activity.
6. `partial-failure.spec.ts` — search "Chamonix", see Surfing as "Not applicable" with reason.
7. `a11y.spec.ts` — run axe-core against landing + ranking pages, expect zero critical violations.

### Selectors

- Role-based only: `page.getByRole('textbox', { name: /city/i })`, `page.getByRole('button', { name: /search/i })`.
- Never CSS or XPath.
- Web-first assertions: `await expect(locator).toBeVisible()` — no `waitForTimeout`.

## CI (GitHub Actions)

Job matrix:

```yaml
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @wa/contracts codegen
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm --filter '{@wa/server,@wa/web}' test -- --coverage
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: '**/coverage' }

  e2e:
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @wa/web exec playwright install --with-deps chromium
      - run: pnpm --filter @wa/web e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: playwright-report, path: packages/web/playwright-report }
```

## Pact — minimal consumer test

The JD requires "TDD with Jest and Pact." A full-fat Pact setup (broker, can-i-deploy, provider verification pipeline) is anti-pattern for a single-team monorepo, but a **minimal consumer test** demonstrates familiarity and marks the checkbox without theatre.

- Package: `@pact-foundation/pact` v13+ (Jest integration)
- Location: `packages/web/src/features/ranking/__pacts__/ranking.pact.test.ts`
- Consumer: `@wa/web`, Provider: `@wa/server`
- One interaction: `activityRankings(cityQuery: "Lisbon") → ActivityRankings` happy path
- Generated pact JSON written to `packages/web/pacts/`
- Provider verification: server-side test at `packages/server/tests/pact/verify.test.ts` reads the pact JSON and hits an in-process Fastify instance
- **No broker required** — pacts flow via git commit only (documented as an "MVP contract testing" step in AI_ASSIST.md)

README trade-off text (draft):
> Pact is set up in its minimal form (one interaction, no broker). The full CDC pattern with a Pact Broker + `can-i-deploy` gates makes sense when consumer and provider have independent deploy cadences and separate teams. For this monorepo — one team, one atomic deploy — the minimal setup demonstrates familiarity without imposing broker infrastructure.

## Rejected alternatives

| Rejected | Chose instead | Why |
|---|---|---|
| Vitest | Jest 30 + `@swc/jest` | JD explicitly says Jest; matching stack > slight speedup |
| Full Pact with broker | Minimal consumer + provider verification, no broker | Broker overhead not justified for single-team, atomic-deploy monorepo |
| Playwright multi-browser (Firefox, WebKit) | Chromium only | ~99 % overlap in coverage; CI time saved |
| Cypress | Playwright | Playwright is faster, better parallelism, native TS |
| Snapshot testing | Explicit assertions | Snapshots rot; explicit intent survives refactors |
| `nock` on backend | `undici.MockAgent` (Node 22 built-in) | nock v13 doesn't intercept native `fetch()`; MockAgent is dep-free |
| MSW on backend too | `undici.MockAgent` on backend, MSW only on frontend | Node-native mock is lighter for Node-only tests |
| E2E against production Open-Meteo | E2E against server with `OPEN_METEO_MODE=stub` | Deterministic, offline, no rate limit risk |
| 100 % coverage goal | 80 % global / 95 % on scoring | Realistic thresholds > vanity metric |
