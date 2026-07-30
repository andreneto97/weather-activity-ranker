# 01 — Domain Model

## Purpose

Define the pure domain types and outbound ports that the rest of the system depends on. The domain is provider-agnostic — no leakage of Open-Meteo, GraphQL, or React concerns.

## Location: `packages/server/src/domain/` and `packages/server/src/ports/`

## Types

### `ActivityKind`
```ts
export const ACTIVITY_KINDS = [
  'SKIING',
  'SURFING',
  'OUTDOOR_SIGHTSEEING',
  'INDOOR_SIGHTSEEING',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
```

### `Location`
```ts
export interface Location {
  readonly id: string;          // stable geocoder id, opaque to client
  readonly name: string;        // "Chamonix-Mont-Blanc"
  readonly country: string;     // "France"
  readonly admin1?: string;     // "Auvergne-Rhône-Alpes"
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;    // IANA, e.g. "Europe/Paris"
  readonly population?: number; // used by ambiguity heuristic
}
```

### `DailyWeather` (provider-agnostic)
```ts
export interface DailyWeather {
  readonly date: string;                     // ISO date (YYYY-MM-DD) in city's local tz
  readonly temperature: { readonly minC: number; readonly maxC: number };
  readonly apparentTempMaxC: number;
  readonly precipitationMm: number;
  readonly precipitationProbabilityMaxPct: number;   // 0..100
  readonly snowfallCm: number;
  readonly wind: { readonly maxKmh: number; readonly gustsKmh: number };
  readonly cloudCoverPct: number;                    // 0..100 mean
  readonly uvIndexMax: number;
  readonly sunshineHours: number;
  readonly weatherCode: number;                       // WMO
}
```

### `MarineDaily` (only when surfing)
```ts
export interface MarineDaily {
  readonly date: string;
  readonly waveHeightMaxM: number;
  readonly swellHeightMaxM: number;
  readonly swellPeriodMaxS: number;
  // NOTE: fields removed since no scorer currently reads them:
  //   swellDirectionDominantDeg (would need spot-specific "offshore direction" per beach)
  //   seaSurfaceTempC (air temp already dominates the "warm enough" component)
  // Re-add if a future scorer needs them; keeping the interface minimal keeps the adapter fetch small.
}
```

### `AirQualityDaily` (only when outdoor sightseeing)
```ts
export interface AirQualityDaily {
  readonly date: string;
  readonly aqiMean: number;      // European AQI 0..>100
  readonly pm25MeanUgm3: number;
}
```

### `Score` + `ScoreComponent`
```ts
export interface ScoreComponent {
  readonly label: string;    // "fresh snow", "low wind"
  readonly value: number;    // 0..1 normalized contribution
  readonly weight: number;   // 0..1, all components' weights sum to ≤ 1
}

export interface Score {
  readonly value: number;                  // 0..100 (integer)
  readonly components: readonly ScoreComponent[]; // sorted by weight desc
}
```

### `DailyScore`
```ts
export interface DailyScore {
  readonly date: string;
  readonly score: Score;
}
```

### `RankedForecast` (one activity's result)
```ts
export interface RankedForecast {
  readonly activity: ActivityKind;
  readonly dailyScores: readonly DailyScore[];    // exactly 7 entries
  readonly bestDay: DailyScore;                   // max by score.value
  readonly overallScore: number;                  // 0..100, mean of top-3 days
}
```

### `RankingResult` (domain-level tagged union)
```ts
export type RankingResult =
  | {
      readonly kind: 'Ok';
      readonly location: Location;
      readonly rankings: readonly RankedForecast[]; // sorted by overallScore desc
      readonly summary: string;
      readonly generatedAt: Date;
    }
  | { readonly kind: 'CityNotFound'; readonly query: string }
  | { readonly kind: 'AmbiguousLocation'; readonly candidates: readonly Location[] }
  | { readonly kind: 'UpstreamUnavailable'; readonly provider: string; readonly cause?: string };
```

The GraphQL layer maps this tagged union to schema-level union types (see [04-graphql-schema.spec.md](04-graphql-schema.spec.md)).

## Ports (outbound interfaces the application depends on)

### `GeocodingPort`
```ts
export interface GeocodingPort {
  search(query: string, opts?: { limit?: number }): Promise<readonly Location[]>;
  getById(id: string): Promise<Location | null>;
}
```
- `search` returns an empty array when no matches.
- Throws `UpstreamError` on network / 5xx failures.

### `WeatherPort`
```ts
export interface WeatherPort {
  getDailyForecast(loc: Location, days: number): Promise<readonly DailyWeather[]>;
}
```
- `days` must be 1..16.
- Returns exactly `days` entries.

### `MarinePort`
```ts
export interface MarinePort {
  getDailyMarine(loc: Location, days: number): Promise<readonly MarineDaily[]>;
}
```
- Throws `NotApplicableError` (subclass of `UpstreamError`) when the coordinates are inland and Marine API returns 400.

### `AirQualityPort`
```ts
export interface AirQualityPort {
  getDailyAirQuality(loc: Location, days: number): Promise<readonly AirQualityDaily[]>;
}
```
- Throws `NotApplicableError` when coverage is unavailable for the region.

### `ClockPort`
```ts
export interface ClockPort {
  now(): Date;
}
```
- Present so `generatedAt` is testable without stubbing `Date`.

### `CachePort` (optional — decorator wraps ports)
```ts
export interface CachePort<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T, ttlMs: number): Promise<void>;
}
```

### `SummarizerPort`
```ts
export interface SummarizerInput {
  readonly city: Location;
  readonly rankings: readonly RankedForecast[];   // already sorted by overallScore desc
  readonly generatedAt: Date;
}

export interface SummarizerPort {
  /**
   * Produces a single-sentence natural summary of the week.
   * Implementations MUST NEVER throw — always return a string, even on upstream failure.
   * The Claude implementation falls back to the template implementation on any error.
   */
  summarize(input: SummarizerInput): Promise<string>;
}
```

Two implementations live in adapters:
- `TemplateSummarizer` (always safe, deterministic)
- `ClaudeHaikuSummarizer` (opt-in via `ANTHROPIC_API_KEY`, wraps the template as fallback)

The composition root picks based on env. Claude implementation constraints (enforced inside the adapter):
- Model: `claude-haiku-4-5`, `max_tokens: 100`, 3 s timeout
- Prompt caching on the system prompt (Anthropic feature)
- Per-city LRU cache with 30 min TTL (same cache pattern as weather)
- **Daily kill switch**: counter of `Anthropic API calls` per UTC day; when count > `SUMMARIZER_DAILY_CAP` (default 500), fall back to template
- Anthropic Console workspace with a **$2 hard-cap** monthly spend limit (configured out-of-band)

Any error, timeout, cap hit, or missing key → return `TemplateSummarizer.summarize(input)`.

## Domain-level errors
```ts
export class UpstreamError extends Error {
  constructor(public readonly provider: string, message: string, public readonly cause?: unknown) {
    super(message);
  }
}

export class NotApplicableError extends UpstreamError {
  constructor(public readonly reason: string, provider: string) {
    super(provider, reason);
  }
}
```

These are the only errors the domain / application layer throws. Adapter-level errors (Zod parse failures, HTTP timeouts) are translated at the adapter boundary.

## Invariants (testable)

- `DailyWeather.date` is `YYYY-MM-DD` — no time component.
- `DailyWeather.cloudCoverPct` ∈ `[0, 100]`.
- `DailyWeather.temperature.minC <= temperature.maxC`.
- `DailyWeather.precipitationProbabilityMaxPct` ∈ `[0, 100]`.
- `Score.value` ∈ `[0, 100]` and is an integer.
- `Score.components` sorted by `weight` desc; ∑`weight ≤ 1`.
- `RankedForecast.dailyScores.length === 7` (asserted before ranking; throws in dev, logs+continues in prod with warn).
- `RankedForecast.bestDay` is the element with maximum `score.value`. **Tie-breaker: earliest date wins.**
- `RankedForecast.overallScore = round(mean(top-3 scores))`.
- `RankingResult.Ok.rankings` sorted by `overallScore` desc; **exactly 4 entries always** (Not-Applicable activities still appear, with score 0).

Property tests (fast-check) enforce these invariants across random inputs — see [06-testing-strategy.spec.md](06-testing-strategy.spec.md).

## Rejected alternatives

| Rejected | Chose instead | Why |
|---|---|---|
| Zod schemas as domain types | Plain TS interfaces | Domain stays framework-free; Zod lives in adapters |
| Classes with methods | Interfaces + pure functions | Immutability, easier property-based testing |
| `Record<string, number>` for components | Typed `ScoreComponent[]` | Ordered, labeled, weight visible in UI |
| Passing raw `OpenMeteoResponse` into scorers | Normalized `DailyWeather` | Provider-agnostic; swap in Météo-France without touching domain |
| Union `NotApplicable` inside `RankedForecast` | `Score { value: 0, components: [{ label: 'Not applicable' }] }` | Simpler shape; UI still knows via `overallScore === 0` + reason label |
| Throwing exceptions for domain errors | Tagged union `RankingResult` | Errors are first-class data; GraphQL maps to schema union |

## Dependencies

- **Nothing at runtime.** No zod, no lru-cache, no fetch. Only TypeScript types and pure functions.
- **Tests may use** `fast-check`, `@jest/globals`, and factory helpers from `tests/support/`.
