# 03 — Open-Meteo Adapters

## Purpose

Implement the four ports (`GeocodingPort`, `WeatherPort`, `MarinePort`, `AirQualityPort`) against Open-Meteo's APIs. The adapters own HTTP calls, Zod validation, retries, and DTO→domain mapping.

## Location: `packages/server/src/adapters/outbound/open-meteo/`

## Reference

- Full API reference: [../research/01-open-meteo-api.md](../research/01-open-meteo-api.md)
- Attribution: CC-BY 4.0 — frontend footer must display "Weather data by [Open-Meteo](https://open-meteo.com/) · CC-BY 4.0" (canonical string in [07-ui-ux.spec.md](07-ui-ux.spec.md))

## Shared HTTP client (`infrastructure/http.ts`)

```ts
import type { ZodType } from 'zod';

export interface HttpGetOptions<T> {
  readonly url: string;
  readonly params?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly provider: string;        // 'open-meteo-forecast' etc, used in errors + logs
  readonly schema: ZodType<T>;      // Zod schema validates the JSON response
  readonly timeoutMs?: number;      // overrides default
}

export interface HttpClient {
  getJson<T>(opts: HttpGetOptions<T>): Promise<T>;
}

export interface HttpClientDefaults {
  readonly timeoutMs: number;
  readonly retries?: number;       // default 3
}

export function createHttpClient(defaults: HttpClientDefaults): HttpClient;
```

Responsibilities of the client:
- Assemble URL from `url` + `params` (skips `undefined` values).
- Native `fetch` + `AbortController` for timeout.
- Reads current `x-request-id` from `AsyncLocalStorage` and forwards as request header.
- On non-2xx: throws `UpstreamError(provider, `HTTP ${status}: ${bodyText}`)`.
- On timeout: throws `UpstreamError(provider, 'Timeout')` (with `cause: AbortError`).
- Retry via **inline retry loop** (see below): 3 tries by default, exp backoff 100 → 400 → 1600 ms with jitter.
- **Retry policy: retry only on `UpstreamError` with `status ∈ {408, 429, 500, 502, 503, 504}` or with `cause instanceof AbortError`. Never retry 4xx (except 429). Never retry Zod parse errors.**
- On success: `schema.safeParse(await res.json())` — on failure throws `UpstreamError(provider, 'Schema mismatch: ...')` (data-corruption signal, not retryable).

**Retry: inline loop, not `p-retry`.** Rationale documented in AI_ASSIST.md: `p-retry` is ESM-only which conflicts with Jest's default node_modules handling under pnpm; a ~30-line inline retry with `DoNotRetryError` marker gave us the same behaviour without the interop pain. Semantics are identical (exponential backoff + jitter, retry-until-attempt-count-exceeded, non-retryable escape hatch).

Adapters call `httpClient.getJson({ url, params, provider, schema })` — no manual URL building, no manual parsing, no manual retry.

## File layout

```
adapters/outbound/open-meteo/
├── dto.ts            # Zod schemas for all four responses
├── mappers.ts        # dto → domain conversion (pure, unit-tested)
├── weather.adapter.ts
├── geocoding.adapter.ts
├── marine.adapter.ts
├── air-quality.adapter.ts
└── __fixtures__/     # captured JSON samples for tests
    ├── forecast-lisbon.json
    ├── geocoding-springfield.json
    ├── marine-rio.json
    ├── marine-chamonix-error.json
    └── air-quality-barcelona.json
```

## Geocoding adapter

- Base URL: `https://geocoding-api.open-meteo.com/v1/search`
- Params: `name`, `count`, `language=en`, `format=json`
- Response: `{ results?: Array<...> }` — `results` **may be absent** when no matches.
- Maps to `Location[]`.
- `getById` uses `https://geocoding-api.open-meteo.com/v1/get?id=…`.

## Weather adapter

- Base URL: `https://api.open-meteo.com/v1/forecast`
- Params: `latitude`, `longitude`, `timezone=auto`, `forecast_days`, then a **fixed daily variable set** that covers all activities:
  ```
  daily=weather_code,temperature_2m_max,temperature_2m_min,
        apparent_temperature_max,precipitation_sum,
        precipitation_probability_max,snowfall_sum,
        wind_speed_10m_max,wind_gusts_10m_max,
        cloud_cover_mean,uv_index_max,sunshine_duration
  ```
- Sunshine returned in seconds → mapper divides by 3600.
- Response arrays are column-oriented — mapper zips them into a row-oriented `DailyWeather[]`.

## Marine adapter

- Base URL: `https://marine-api.open-meteo.com/v1/marine`
- Params: `latitude`, `longitude`, `timezone={location.timezone}`, `forecast_days`, `cell_selection=sea` (forces the nearest ocean grid cell — with `nearest`, coastal cities whose centroid sits over a bay or estuary get a land cell that returns null wave fields; `sea` returns HTTP 400 for truly inland cities, which we already map to `NotApplicableError` below), `length_unit=metric`.
  - **Note**: pass the explicit IANA timezone from `Location.timezone` — Marine API has historically rejected `timezone=auto` for some coordinates.
- Daily variables (verified against Open-Meteo Marine API docs): `wave_height_max,swell_wave_height_max,swell_wave_period_max`. That's it — no swell direction or SST, matching the trimmed `MarineDaily` interface (see spec 01).
- **Error handling**: if Open-Meteo returns 400 `{"reason": "..."}` (indicates inland or unsupported region), map to `NotApplicableError('No coastal data', 'open-meteo-marine')`. The use case catches this and produces `notApplicableScore` for surfing rather than propagating.

## Air Quality adapter

- Base URL: `https://air-quality-api.open-meteo.com/v1/air-quality`
- Params: `latitude`, `longitude`, `timezone=auto`, `forecast_days`
- Hourly variables: `european_aqi,pm2_5` — mapper aggregates to daily mean.
- Returns `AirQualityDaily[]` on success.
- On any coverage error (400 / empty array), throw `NotApplicableError('No AQI coverage', 'open-meteo-air-quality')`. Use case catches and skips that scoring component.

## Zod validation

Every adapter parses the raw response with `Schema.parse()`. If it fails, throws `UpstreamError` with the Zod issue joined into the message. This catches Open-Meteo schema drift immediately in prod rather than silent corruption.

Example:
```ts
export const ForecastResponse = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    // …
  }),
});
```

Fixtures in `__fixtures__/` are trimmed to only the fields we use — they double as spec of "these are the fields we depend on".

## Cache decorator

Location: `packages/server/src/adapters/outbound/cache/lru-cached.ts`

Wraps any port with an LRU cache. TTLs (all read from env with defaults):
| Kind | env | default |
|---|---|---|
| Weather | `CACHE_TTL_WEATHER_MS` | 1_800_000 (30 min) |
| Marine | `CACHE_TTL_MARINE_MS` | 1_800_000 (30 min) |
| Air Quality | `CACHE_TTL_AQI_MS` | 1_800_000 (30 min) |
| Geocoding search | `CACHE_TTL_GEOCODING_MS` | 86_400_000 (24 h) |
| Geocoding by-id | (same as search) | 86_400_000 |

Cache key strategy per port — includes a **schema-version prefix** so cache is invalidated on deploy of new variable sets or schema changes:

```ts
const CACHE_SCHEMA_VERSION = 'v1';

// Weather / Marine / AQI:
`${CACHE_SCHEMA_VERSION}:${provider}:${lat.toFixed(3)}:${lon.toFixed(3)}:${timezone}:${days}`

// Geocoding search:
`${CACHE_SCHEMA_VERSION}:geocode:search:${normalize(query)}:${limit}`   // normalize = lowercase + trim + collapse spaces

// Geocoding getById:
`${CACHE_SCHEMA_VERSION}:geocode:id:${id}`
```

Timezone in the key prevents cross-tz collisions between adjacent locations. Schema version bumps on every response-shape change.

The decorator is composed in `composition-root.ts`. Adapters remain agnostic of caching.

## Retry policy

- Attempts: 3
- Backoff: exponential (100 ms → 400 ms → 1600 ms) with jitter
- Retryable: 5xx, 429, `AbortError` (timeout)
- **Non-retryable**: 4xx (except 429), Zod parse failures, `NotApplicableError`

## Rate limiting (upstream side)

- Global concurrency cap: 4 concurrent Open-Meteo requests per process (uses `p-limit`).
- If Open-Meteo starts returning 429 despite our cache, the retry backoff smooths it.
- If sustained 429, `UpstreamError` propagates and the GraphQL layer returns `UpstreamUnavailableError`.

## Testing (see [06-testing-strategy.spec.md](06-testing-strategy.spec.md))

- Unit: `dto.test.ts` (Zod schemas against fixtures), `mappers.test.ts` (pure), each adapter has `.test.ts` using `undici.MockAgent` (via `tests/support/mock-http.ts`) for happy path + retry + timeout + NotApplicable + 400/500.
- Integration: `rank-activities.integration.test.ts` wires real adapters + cache + fake `HttpJson` returning fixtures.

## `dev:mock` mode for Playwright / offline dev

Env `OPEN_METEO_MODE=stub` (default: `live`) makes the composition root wire `StubWeatherAdapter` / `StubMarineAdapter` / `StubAirQualityAdapter` / `StubGeocodingAdapter` implementations that read from `adapters/outbound/open-meteo/__fixtures__/`.

- Deterministic responses per input (matches `Lisbon` → sunny fixture, `Chamonix` → cold/snowy, etc.)
- Zero network — Playwright and CI use this to stay offline
- Wired into `package.json`: `"dev:mock": "OPEN_METEO_MODE=stub tsx watch src/main.ts"`

### Stub adapter contract

Each `Stub*Adapter` class:
- **No-arg constructor** — all fixtures loaded at module load via Node 22 JSON import attributes:
  ```ts
  import forecastLisbon from './__fixtures__/forecast-lisbon.json' with { type: 'json' };
  ```
- **Matching key**: `Location.name.toLowerCase()` maps to fixture entries. Fixtures cover **Lisbon, London, Tokyo, Chamonix, Rio de Janeiro** (same set as the cache pre-warm list).
- **Unknown city**: returns a synthetic "neutral" fixture (average weather) so E2E doesn't break on typos.
- **Marine on inland cities** (Chamonix): throws `NotApplicableError('No coastal data', 'open-meteo-marine')` — same contract as live adapter.
- **No caching layer wrapped around stubs** — pointless, they're already synchronous in-memory reads.

Stubs live at `packages/server/src/adapters/outbound/open-meteo/stubs/`. Fixtures shared with unit tests (`__fixtures__/`).

## Invariants

- Adapters never leak Open-Meteo field names (`temperature_2m_max`) into domain types.
- Every adapter returns exactly `days` entries or throws.
- `NotApplicableError` is the only error the use case treats as "not fatal for one activity".
- No adapter has state (all deps injected via factory).

## Rejected alternatives

| Rejected | Chose instead | Why |
|---|---|---|
| `axios` | native `fetch` | Node 22 has `fetch`; Mar 2026 axios supply-chain compromise makes it a bad look |
| `undici.request` | native `fetch` | `fetch` is idiomatic; undici's advantages (pool tuning) don't apply here |
| Per-activity variable lists | Fixed superset for forecast | Simpler; payload delta negligible; one request per city per TTL |
| Separate `SST` request | Merge into marine adapter | Cleaner interface for surfing scorer |
| Boolean `notApplicable` on adapter return | Throw `NotApplicableError` | Use case's try/catch keeps port shapes clean |
| Cache in-adapter | Decorator | Composition-root controls TTLs; adapters stay testable without cache |
