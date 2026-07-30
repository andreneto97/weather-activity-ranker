# 08 — Use Case: RankActivitiesForCity

## Purpose

Orchestrate geocoding, weather fetching, per-activity scoring (with partial failure), and summarization. This is the single application-layer entry point called by the GraphQL resolver.

## Location: `packages/server/src/application/rank-activities.usecase.ts`

## Contract

```ts
export interface RankActivitiesInput {
  readonly cityQuery?: string;      // free-form user input, min 2 chars
  readonly locationId?: string;     // if present, skip geocoding
}

export interface RankActivitiesUseCase {
  execute(input: RankActivitiesInput): Promise<RankingResult>;
}

export interface RankActivitiesDeps {
  readonly geocoding: GeocodingPort;
  readonly weather: WeatherPort;
  readonly marine: MarinePort;
  readonly airQuality: AirQualityPort;
  readonly scorers: ScorerRegistry;
  readonly summarizer: SummarizerPort;
  readonly clock: ClockPort;
  readonly logger: Logger;
  readonly weights: ScoringWeights;
}

export const makeRankActivitiesUseCase = (deps: RankActivitiesDeps): RankActivitiesUseCase;
```

The factory (`makeRankActivitiesUseCase`) is the only exported symbol. No class, no `this`.

## Input contract

- Exactly one of `cityQuery` or `locationId` must be present (validated at GraphQL boundary via Zod).
- If both provided, `locationId` wins and a warning is logged.
- `cityQuery` is trimmed and lowercased for cache lookup but stored as-provided for logging.
- `locationId` is opaque — passed through to `GeocodingPort.getById`.

## Orchestration steps

```
1. Resolve location
   ├─ if input.locationId → geocoding.getById(id)
   │    ├─ null   → return { kind: 'CityNotFound', query: '<id>' }
   │    └─ found  → proceed with that Location
   └─ if input.cityQuery → geocoding.search(query, { limit: 5 })
        ├─ []            → return { kind: 'CityNotFound', query }
        ├─ 1 result       → proceed with it
        └─ N > 1 results  → apply ambiguity heuristic (see §Ambiguity)

2. Fetch forecast (always required)
   └─ weather.getDailyForecast(location, days=7)
        └─ throw UpstreamError → return { kind: 'UpstreamUnavailable', provider: 'open-meteo-forecast' }
   (no partial-failure salvage — without forecast, nothing to score)

3. Conditionally fetch marine (only if any surfing-relevant scorer registered)
   └─ marine.getDailyMarine(location, 7)
        ├─ NotApplicableError  → marine = null (proceed)
        ├─ UpstreamError       → marine = null (proceed with warning log)
        └─ ok                  → marine = data

4. Conditionally fetch AQI (only if any outdoor-relevant scorer registered)
   └─ airQuality.getDailyAirQuality(location, 7)
        ├─ NotApplicableError  → airQuality = null (proceed)
        ├─ UpstreamError       → airQuality = null (proceed with warning log)
        └─ ok                  → airQuality = data

5. Build per-day ScoringContext keyed by date (Map for O(1) lookup by date string).
   Optional fields (`marine`, `airQuality`) are conditionally spread — never assigned as
   `undefined`, which would violate `exactOptionalPropertyTypes`.

   const contextByDate = new Map<string, ScoringContext>();
   for (let i = 0; i < week.length; i++) {
     const day = week[i]!;                    // noUncheckedIndexedAccess: assert with !
     const m = marine?.[i];
     const a = airQuality?.[i];
     contextByDate.set(day.date, {
       ...(m ? { marine: m } : {}),
       ...(a ? { airQuality: a } : {}),
       weights: deps.weights,
     });
   }

6. Score every activity × every day (wrapped in try/catch via `safeRank` at `application/safe-rank.ts`)
   for scorer in scorers.all():
     rankedForecast = safeRank(scorer, week, day => contextByDate.get(day.date)!, logger)
     // safeRank (application layer, depends on Logger) catches unexpected exceptions
     // and returns notApplicableRankedForecast('Scoring failed').
     // Scorers themselves already return notApplicableScore for domain "not applicable"
     // cases (e.g., Surfing without marine data).

7. Sort rankings by overallScore desc (ties broken by activity kind order: SKIING < SURFING < OUTDOOR_SIGHTSEEING < INDOOR_SIGHTSEEING)

8. Summarize
   summary = await summarizer.summarize({
     city: location, rankings, generatedAt: clock.now()
   })
   // Never throws (SummarizerPort contract)

9. Return { kind: 'Ok', location, rankings, summary, generatedAt: clock.now() }
```

## Ambiguity heuristic

Documented in code with comment referencing this spec section.

```ts
function resolveAmbiguity(candidates: readonly Location[]): {
  location: Location | null;              // null → treat as ambiguous
  candidates?: readonly Location[];
} {
  const [top, second, ...rest] = candidates;
  if (!second) return { location: top };                // single candidate = unambiguous
  if (!top?.population || !second.population) return { candidates };  // no pop data = ambiguous
  if (top.population > 2 * second.population) {
    // Clear population lead — auto-pick, log warning
    return { location: top };
  }
  return { candidates };                                 // ambiguous
}
```

- Threshold: **top.population > 2 × second.population** → auto-pick top.
- If auto-picked, log: `warn({ query, chosen: top.name, alternatives: [second.name, ...] }, 'ambiguous location auto-resolved')`.
- If ambiguous, return `{ kind: 'AmbiguousLocation', candidates: top-5 sorted by population desc }`.

## Partial failure semantics

The use case guarantees:
- **Forecast is atomic**: fails → whole request fails with `UpstreamUnavailable`.
- **Marine/AQI are advisory**: fail → the scorer for the affected activity returns `notApplicableScore(reason)`, other activities unaffected.
- Scorers that don't need marine/AQI never see them missing (context field just undefined).
- If a scorer itself throws (bug), catch, log at error level, return `notApplicableScore('Scoring failed')` for that activity — never bring the whole response down.

## `GeocodeUseCase` (companion for command palette)

```ts
export interface GeocodeUseCase {
  execute(query: string, limit?: number): Promise<readonly Location[]>;
}

export const makeGeocodeUseCase = (deps: { geocoding: GeocodingPort }): GeocodeUseCase;
```

Trivial pass-through — exists only to give the resolver a use-case-level dependency (uniform layering) and to be a natural place for future concerns like input normalization or search-history persistence.

## Invariants (testable)

- Given any valid `RankingResult.Ok`, `rankings.length === 4`.
- `rankings` sorted by `overallScore` descending.
- Summary is a non-empty string.
- `generatedAt` equals the clock at step 8 (not step 1).
- If `input.locationId` present, geocoding.search is never called.
- If marine returns NotApplicable, Surfing's `RankedForecast.bestDay.score.value === 0`.
- If forecast throws, marine and AQI are never called.

## Error → Result mapping

| Error thrown by | Handled how |
|---|---|
| `geocoding.search` throws `UpstreamError` | Return `{ kind: 'UpstreamUnavailable', provider }` |
| `geocoding.getById` returns null | Return `{ kind: 'CityNotFound', query: '<id>' }` |
| `weather` throws `UpstreamError` | Return `{ kind: 'UpstreamUnavailable', provider }` |
| `marine` throws `NotApplicableError` | Set marine = null, continue |
| `marine` throws `UpstreamError` | Log warn, set marine = null, continue |
| `airQuality` throws (any) | Log warn, set airQuality = null, continue |
| Scorer throws | Log error, use `notApplicableScore('Scoring failed')` for that activity |
| `summarizer.summarize` throws | Impossible per contract, but defensive: use template string as last resort |

## Rejected alternatives

| Rejected | Chose instead | Why |
|---|---|---|
| One giant `execute` function | Small step functions inside, called sequentially | Testable + readable |
| Parallel `Promise.all` on all fetches | Sequential geocoding → parallel weather/marine/AQI | Cache benefits from serial geocoding hits; upstream calls parallelised where independent |
| Marine/AQI failures bubbling as `UpstreamUnavailable` | Downgrade to `notApplicableScore` for that activity | The user still gets 3 useful scores; better UX |
| Ambiguity check on ID lookup | Only on free-text query | ID is unique by definition |
| Population-only heuristic | (kept as chosen) | Simple, defensible, tunable if it produces bad results |

## `safeRank` helper (application layer)

`packages/server/src/application/safe-rank.ts`:

```ts
import type { Logger } from 'pino';
import { rank, notApplicableRankedForecast } from '../domain/scoring/util.js';
import type { ActivityScorer, ScoringContext } from '../domain/scoring/scorer.js';
import type { DailyWeather } from '../domain/daily-weather.js';
import type { RankedForecast } from '../domain/ranked-forecast.js';

export function safeRank(
  scorer: ActivityScorer,
  week: readonly DailyWeather[],
  ctx: (day: DailyWeather) => ScoringContext,
  logger: Logger,
): RankedForecast {
  try {
    return rank(scorer, week, ctx);
  } catch (err) {
    logger.error({ err, activity: scorer.activity }, 'scorer threw');
    return notApplicableRankedForecast(scorer.activity, week.map((d) => d.date), 'Scoring failed');
  }
}
```

Lives in `application/` (not `domain/`) because it depends on `pino`'s `Logger`. Domain stays pure.

## Composition root

`packages/server/src/composition-root.ts` is the single file that wires all adapters into use cases. Signature:

```ts
export interface Container {
  readonly rankActivities: RankActivitiesUseCase;
  readonly geocode: GeocodeUseCase;
  readonly logger: Logger;
}

export interface BuildContainerOverrides {
  readonly logger?: Logger;
  readonly clock?: ClockPort;
  readonly http?: HttpClient;
  readonly summarizer?: SummarizerPort;
}

export function buildContainer(env: ServerEnv, overrides?: BuildContainerOverrides): Container;
```

Wiring order:

```ts
import { defaultScoringWeights } from './config/scoring.config.js';

export function buildContainer(env: ServerEnv, overrides: BuildContainerOverrides = {}): Container {
  const logger = overrides.logger ?? createLogger(env);
  const clock: ClockPort = overrides.clock ?? new SystemClock();
  const http: HttpClient = overrides.http ?? createHttpClient({ timeoutMs: env.OPEN_METEO_TIMEOUT_MS });

  // Adapters — swap for Stub* when env.OPEN_METEO_MODE === 'stub'
  const isStub = env.OPEN_METEO_MODE === 'stub';
  const geocoding: GeocodingPort = withLruCache(
    isStub ? new StubGeocodingAdapter() : new OpenMeteoGeocodingAdapter(http),
    { ttlMs: env.CACHE_TTL_GEOCODING_MS, max: 500 },
  );
  const weather: WeatherPort = withLruCache(
    isStub ? new StubWeatherAdapter() : new OpenMeteoWeatherAdapter(http),
    { ttlMs: env.CACHE_TTL_WEATHER_MS, max: 500 },
  );
  const marine: MarinePort = withLruCache(
    isStub ? new StubMarineAdapter() : new OpenMeteoMarineAdapter(http),
    { ttlMs: env.CACHE_TTL_MARINE_MS, max: 500 },
  );
  const airQuality: AirQualityPort = withLruCache(
    isStub ? new StubAirQualityAdapter() : new OpenMeteoAirQualityAdapter(http),
    { ttlMs: env.CACHE_TTL_AQI_MS, max: 500 },
  );

  // Scorers — registered fluently. Weights come from a static config, not env.
  const scorers = new ScorerRegistry()
    .register(createSkiScorer(defaultScoringWeights.ski))
    .register(createSurfScorer(defaultScoringWeights.surf))
    .register(createOutdoorScorer(defaultScoringWeights.outdoor))
    .register(createIndoorScorer(defaultScoringWeights.indoor));

  // Summarizer — picked by env, overridable for tests
  const template = new TemplateSummarizer();
  const summarizer: SummarizerPort = overrides.summarizer ?? (env.ANTHROPIC_API_KEY
    ? new ClaudeHaikuSummarizer({
        apiKey: env.ANTHROPIC_API_KEY,
        fallback: template,
        dailyCap: env.SUMMARIZER_DAILY_CAP,
        clock,
        logger,
      })
    : template);

  const rankActivities = makeRankActivitiesUseCase({
    geocoding, weather, marine, airQuality, scorers, summarizer, clock, logger,
    weights: defaultScoringWeights,
  });
  const geocode = makeGeocodeUseCase({ geocoding });

  return { rankActivities, geocode, logger };
}
```

Called once in `main.ts` at boot. Cache pre-warm (Lisbon, London, Tokyo, Chamonix, Rio) runs asynchronously after `buildContainer` returns.

**Fly.io deployment is single-instance** — the in-process `SUMMARIZER_DAILY_CAP` counter is authoritative. If we scaled to N instances the cap would become `N × cap`; call this out in trade-offs if that happens.

## Testing

Covered extensively by [06-testing-strategy.spec.md](06-testing-strategy.spec.md) unit + integration suites. Key tests:

- `rank-activities.usecase.test.ts` — unit, all deps stubbed, exercises every branch of the flow diagram
- `tests/integration/rank-activities-happy.test.ts` — real adapters (undici MockAgent)
- `tests/integration/rank-activities-partial-fail.test.ts` — Marine down, Surfing not-applicable
- `tests/integration/rank-activities-ambiguous.test.ts` — Springfield returns AmbiguousLocation
- `tests/integration/rank-activities-not-found.test.ts` — garbage query returns CityNotFound
- `tests/integration/rank-activities-upstream-down.test.ts` — Forecast 500 returns UpstreamUnavailable
