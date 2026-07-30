# Testing Strategy (2026)

TypeScript + Node.js + GraphQL backend + React frontend. Company culture: TDD with Jest and Pact. Include unit tests + Playwright E2E.

---

## 1. Unit Test Runner

### Landscape
| Runner | Weekly downloads | ESM/TS DX | Cold-start (500 tests) | Mocking |
|---|---|---|---|---|
| Jest 30 | ~25M | Improved in v30 | ~12s | Excellent (mature) |
| Vitest 3.x | Fast-growing, ~15M+ | Native (Vite pipeline) | ~1.5s (8× faster) | Excellent |
| `node:test` | Native | Native since Node 22 | Fastest | Weaker |

### Recommendation: **Jest 30 + `@swc/jest`**

Their culture explicitly says "TDD with Jest and Pact." Match their stack, then note in README "would evaluate Vitest for a greenfield project."

### Clean Jest + TS + ESM setup (2026)

```json
// package.json
{
  "type": "module",
  "scripts": {
    "test": "node --experimental-vm-modules node_modules/jest/bin/jest.js",
    "test:watch": "npm test -- --watch",
    "test:cov": "npm test -- --coverage"
  }
}
```

```ts
// jest.config.ts (Jest 30 supports TS config natively)
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // strip .js for ESM TS imports
  },
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', tsx: false },
        target: 'es2022',
      },
      module: { type: 'es6' },
    }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 75, statements: 80 },
  },
};

export default config;
```

Why SWC over `ts-jest`: 3–5× faster transforms; type checking already runs in CI via `tsc --noEmit`.

---

## 2. What to Unit Test (Prioritized)

| # | Target | Why high-signal |
|---|---|---|
| **1** | **Activity scorers (pure functions)** | Textbook TDD. Table-driven tests demonstrate discipline. |
| **2** | **Open-Meteo response parser/normalizer** | Anti-corruption boundary. Fixture-driven. |
| **3** | **Ranking service (aggregating scores)** | Composition. Mock scorers with `jest.fn`. |
| **4** | **GraphQL resolver(s)** | Integration test with real schema + stubbed provider. |

Skip: type-only code, trivial utility helpers.

---

## 3. Testing Pyramid

```
        /\
       /E2E\        1+ Playwright tests: "user types city → sees ranking"
      /------\
     / Integ  \     3+ tests: GraphQL server + stubbed Open-Meteo provider
    /----------\
   /   Unit     \   10+ tests: scorers, parser, ranking, small resolver units
  /--------------\
```

For quality-focused build:
- **~15+ unit tests** (scorers + parser + ranking edges)
- **~4+ integration tests** (GraphQL schema + faked upstream)
- **~2+ E2E tests** (Playwright: happy path + error path)

---

## 4. Playwright in 2026

### Setup for React + Vite

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

### Real backend vs mocked
**Recommended: real backend, mock Open-Meteo at HTTP layer** (nock or MSW/node in the backend process). Demonstrates trust-boundary awareness.

### Selectors — role-based, always
- Official 2026 practice: `getByRole` for ~95% of cases; fall back to `getByLabel` / `getByPlaceholder` / `getByText`, then `getByTestId`.
- Web-first assertions only: `await expect(locator).toBeVisible()` — no `waitForTimeout`.
- Locator chaining: `page.getByRole('row', { name: 'London' }).getByRole('button', { name: 'Details' })`.

### Structure — Page Objects only when justified
For a small suite, functional helpers are fine. When suite grows, extract POs per route.

### Example test
```ts
// e2e/city-ranking.spec.ts
import { test, expect } from '@playwright/test';
import { setupOpenMeteoStub } from './helpers/openMeteoStub';

test('user types a city and sees an activity ranking', async ({ page }) => {
  await setupOpenMeteoStub();

  await page.goto('/');
  await page.getByRole('textbox', { name: /city/i }).fill('Lisbon');
  await page.getByRole('button', { name: /search/i }).click();

  const results = page.getByRole('list', { name: /activities/i });
  await expect(results).toBeVisible();
  await expect(results.getByRole('listitem').first())
    .toContainText(/surfing/i);
});
```

---

## 5. Mocking Strategy

| Layer | Tool | Why |
|---|---|---|
| **Frontend fetch (unit/component)** | MSW v2 | Network-level, reuses handlers across Vitest/Jest/Storybook |
| **Backend outbound HTTP (Open-Meteo)** | **nock** | Node-only, mature, purpose-built |
| **Playwright E2E** | Backend-side nock (real backend, mocked upstream) OR `page.route()` for pure client-side |

### Faking Open-Meteo without brittle test data
- Save **one canonical JSON fixture per scenario** (`sunny.json`, `rainy.json`, `windy.json`).
- Trim to fields you actually use.
- Version alongside parser tests: `src/openMeteo/__fixtures__/`.
- Parser tests read fixtures; ranking tests use **normalized domain objects**, not raw wire format.

```ts
// src/openMeteo/__fixtures__/sunny.ts
export const sunnyLisbon = {
  latitude: 38.7,
  longitude: -9.13,
  hourly: {
    time: ['2026-07-28T12:00'],
    temperature_2m: [28.3],
    wind_speed_10m: [12.4],
    precipitation: [0],
  },
} satisfies OpenMeteoResponse;
```

---

## 6. Pact / Contract Testing

Pact V3+ supports REST/GraphQL/gRPC via its Plugin Framework. For GraphQL, contracts are per-operation.

Include in this build to match company culture:
- One consumer contract test in the React app for the main query.
- Provider verification in the GraphQL server tests.
- Publish pacts to a local Pact Broker (or just filesystem for the demo).

---

## 7. Test Data / Fixtures

Patterns:
- **Factory functions with `satisfies`**, not massive shared JSON files.
- **Named scenarios**: `makeWeather({ overrides })` beats `weather.json`.
- **Colocation**: fixtures next to code (`src/scorers/__fixtures__/`).
- **Freeze time**: `vi.useFakeTimers()` / `jest.useFakeTimers()` for date-dependent tests.

```ts
// src/domain/__factories__/weather.ts
import type { NormalizedWeather } from '../types.js';

export const makeWeather = (
  overrides: Partial<NormalizedWeather> = {}
): NormalizedWeather => ({
  city: 'Lisbon',
  tempC: 22,
  windKph: 10,
  precipMm: 0,
  timestamp: '2026-07-28T12:00:00Z',
  ...overrides,
});
```

---

## 8. CI-Friendly Test Config

- **Headless by default** (Playwright).
- **No external network** — MSW/nock guard rails; `onUnhandledRequest: 'error'`, `nock.disableNetConnect()`.
- **Deterministic clocks** — fake timers.
- **`forbidOnly: !!process.env.CI`** in Playwright.
- **Retries only in CI** (`retries: process.env.CI ? 2 : 0`).
- **Trace/screenshot on failure**.
- **Sharding hook** ready: `--shard=1/4`.

```yaml
# .github/workflows/test.yml
- run: npm ci
- run: npm run typecheck
- run: npm run lint
- run: npm test -- --coverage
- run: npx playwright install --with-deps
- run: npm run test:e2e
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 7
```

---

## 9. Coverage Thresholds

```ts
coverageThreshold: {
  global: { lines: 80, functions: 80, branches: 75, statements: 80 },
  './src/scoring/': { lines: 95, functions: 95, branches: 90, statements: 95 },
}
```

Higher bar on the pure logic (scorers), realistic bar overall.

---

## 10. Concrete Testing Plan

| # | File | Coverage | Why |
|---|---|---|---|
| 1 | `src/scoring/skiing.test.ts` | Table-driven: perfect ski day, terrible day, edge (0 snow, high wind), boundary of piecewise curves | Pure TDD |
| 2 | `src/scoring/surfing.test.ts` | Onshore vs offshore wind, groundswell vs chop, height bands | Domain expertise signal |
| 3 | `src/scoring/outdoor-sightseeing.test.ts` | Comfort temp, precip cutoff, AQI penalty | |
| 4 | `src/scoring/indoor-sightseeing.test.ts` | Inverse of outdoor (rewards bad weather) | Domain thinking |
| 5 | `src/adapters/open-meteo/dto.test.ts` | Fixture: normal, malformed, missing fields | Anti-corruption boundary |
| 6 | `src/adapters/open-meteo/geocoder.test.ts` | Zero matches, multiple matches, disambiguation | |
| 7 | `src/adapters/cache/lru-cached.test.ts` | Hit, miss, TTL expiry, key normalization | Decorator pattern verified |
| 8 | `src/application/rank-week.test.ts` | Composition with mocked ports | Use-case orchestration |
| 9 | `src/interfaces/graphql/resolvers.test.ts` | Real schema, stubbed provider — run a query, assert shape | Integration |
| 10 | `src/interfaces/graphql/errors.test.ts` | Union result: `CityNotFoundError`, `UpstreamUnavailableError` | Errors-as-data |
| 11 | `e2e/happy-path.spec.ts` | User types city → sees ranking | E2E |
| 12 | `e2e/city-not-found.spec.ts` | User types garbage → friendly error UI | E2E error path |
| 13 | `e2e/switch-activity.spec.ts` | Change activity filter → ranking updates | E2E interaction |

---

## Sources
- https://jestjs.io/docs/upgrading-to-jest30
- https://www.npmjs.com/package/@swc/jest
- https://playwright.dev/docs/best-practices
- https://mswjs.io/
- https://docs.pact.io/
