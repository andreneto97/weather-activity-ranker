# Architectural Playbook — Weather Activity Ranker

Ship a well-sized hexagon. Draw the seams clearly. Trade-offs doc is a first-class deliverable.

---

## 1. Hexagonal / Ports & Adapters

### Mental model for this problem

The **hexagon** is the ranking engine. Inputs: "a location and some weather." Outputs: "ranked activities." Everything else (Open-Meteo, GraphQL, React) is an adapter around it.

```
                    ┌───────────────── Driving side (inbound) ─────────────────┐
                    │                                                          │
   HTTP / GraphQL ──►  GraphQL Resolver Adapter                                │
                    │       │                                                  │
                    │       ▼                                                  │
                    │  ┌───────────────────────────────────────────────────┐   │
                    │  │        APPLICATION (use cases)                    │   │
                    │  │  RankActivitiesForCity(cityQuery) : Ranking       │   │
                    │  └──────┬──────────────────────────┬─────────────────┘   │
                    │         │ uses ports               │                     │
                    │         ▼                          ▼                     │
                    │   [GeocodingPort]           [WeatherPort]                │
                    │   [ActivityRegistry]        [Clock]  [Cache]             │
                    │                                                          │
                    │  ┌───────────────────────────────────────────────────┐   │
                    │  │        DOMAIN (pure)                              │   │
                    │  │  Location, DailyWeather, ActivityScore,           │   │
                    │  │  RankedForecast, ActivityScorer (interface)       │   │
                    │  │  SkiScorer, SurfScorer, OutdoorScorer, ...        │   │
                    │  └───────────────────────────────────────────────────┘   │
                    └──────────┬───────────────────────────┬─────────────────┘
                               │ driven side (outbound)    │
                               ▼                           ▼
                    OpenMeteoGeocodingAdapter    OpenMeteoWeatherAdapter
                    (HTTP + DTO → domain)        (HTTP + DTO → domain)
```

### The ports (four, no more)

```ts
export interface GeocodingPort {
  search(query: string, opts?: { limit?: number }): Promise<Location[]>;
}

export interface WeatherPort {
  getDailyForecast(loc: Location, days: number): Promise<DailyWeather[]>;
}

export interface Clock { now(): Date; }

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}
```

`ActivityScorer` is a **domain interface**, not an outbound port — belongs inside the hexagon under `domain/scoring/`.

### Folder structure

```
packages/server/src/
├── domain/                    # pure, no I/O, no framework imports
│   ├── location.ts
│   ├── daily-weather.ts
│   ├── activity.ts
│   ├── ranked-forecast.ts
│   └── scoring/
│       ├── scorer.ts          # ActivityScorer interface + score types
│       ├── ski-scorer.ts
│       ├── surf-scorer.ts
│       ├── outdoor-scorer.ts
│       ├── indoor-scorer.ts
│       └── registry.ts
├── application/
│   └── rank-activities.usecase.ts
├── ports/
│   ├── geocoding.port.ts
│   ├── weather.port.ts
│   ├── clock.port.ts
│   └── cache.port.ts
├── adapters/
│   ├── inbound/
│   │   └── graphql/
│   │       ├── schema.graphql
│   │       ├── resolvers.ts
│   │       └── mappers.ts
│   └── outbound/
│       ├── open-meteo/
│       │   ├── geocoding.adapter.ts
│       │   ├── weather.adapter.ts
│       │   ├── dto.ts
│       │   └── mappers.ts
│       ├── clock/system-clock.ts
│       └── cache/memory-cache.ts
├── composition-root.ts        # ONLY place that news up adapters
└── main.ts                    # bootstraps HTTP server
```

### Avoid over-abstraction

1. **One port per external capability.**
2. **No DI container.** Hand-written `composition-root.ts` is clearer for this scale.
3. **Domain has zero dependencies** — not even `zod`. Validation at adapter boundary.
4. **Only add a port when you cross a process boundary** or want to test-double it.

---

## 2. Strategy pattern for activity scorers

### Interface

```ts
export interface ActivityScorer {
  readonly activity: Activity;
  score(day: DailyWeather): DailyScore;
}

export interface DailyScore {
  value: number;                             // 0..100
  components: Record<string, number>;        // { snow: 40, wind: -10 }
}
```

Returning `components` (not just a number) makes scoring debuggable, explainable in UI, testable at sub-metric level.

### Registration pattern

```ts
export class ScorerRegistry {
  private readonly scorers = new Map<Activity, ActivityScorer>();
  register(s: ActivityScorer) { this.scorers.set(s.activity, s); return this; }
  all(): ActivityScorer[] { return [...this.scorers.values()]; }
  get(a: Activity) {
    const s = this.scorers.get(a);
    if (!s) throw new Error(`No scorer registered for ${a}`);
    return s;
  }
}

// composition-root.ts
const registry = new ScorerRegistry()
  .register(new SkiScorer(config.weights.ski))
  .register(new SurfScorer(config.weights.surf))
  .register(new OutdoorScorer(config.weights.outdoor))
  .register(new IndoorScorer(config.weights.indoor));
```

### Weights/config

```ts
// config/scoring.config.ts
export const defaultScoringConfig = {
  ski: { idealSnowfallCm: 15, maxWindKmh: 40, tempSweetSpotC: -5 },
  surf: { idealWaveHeightM: 1.5 },
  outdoor: { maxPrecipMm: 1, minSunHours: 4, tempComfortRange: [15, 25] },
  indoor: { boostOnPrecipMm: 5, boostOnExtremeTempC: 32 },
} as const;
```

Weights injected, not hardcoded → personalization is a one-line change later.

### Adding a new activity ("kite surfing")
1. Create `kite-surf-scorer.ts` implementing `ActivityScorer`.
2. Add `KITE_SURFING` to `Activity` union.
3. `.register(new KiteSurfScorer(config.weights.kiteSurf))` in composition root.
4. Add weights to `scoring.config.ts`.

**Zero changes** to use case, ports, adapters, or resolvers.

---

## 3. Data flow

### End-to-end pipeline

```
GraphQL query { rankActivities(city: "Chamonix") }
        │
        ▼
 Resolver validates input (zod), calls use case
        │
        ▼
 RankActivitiesUseCase:
   1. locations = geocoding.search(city, limit=5)
   2. if locations.length === 0 → domain error LOCATION_NOT_FOUND
   3. if locations.length > 1 && no disambiguator → return AmbiguousLocation
   4. daily = weather.getDailyForecast(locations[0], days=7)
   5. for each scorer: scores = daily.map(scorer.score)
   6. build RankedForecast per activity
        │
        ▼
 Resolver maps RankedForecast → GraphQL type
        │
        ▼
 React renders
```

### Ambiguity handling ("Springfield")

Model in domain, not exception:

```ts
type RankingResult =
  | { kind: 'Ok'; location: Location; rankings: RankedForecast[] }
  | { kind: 'Ambiguous'; candidates: Location[] };
```

Expose in GraphQL as **union type** (`RankActivitiesResult = RankingSuccess | AmbiguousLocationError`).

### Open-Meteo variables to pull

Fixed superset covering all 4 activities:

```
daily=temperature_2m_max,temperature_2m_min,
      precipitation_sum,snowfall_sum,
      wind_speed_10m_max,wind_gusts_10m_max,
      cloud_cover_mean,uv_index_max,
      sunshine_duration,weather_code
&timezone=auto&forecast_days=7
```

For surfing, also call Marine API for wave data.

### Normalization — DTO → domain

Adapter is the ONLY place that knows Open-Meteo's column-oriented JSON:

```ts
export function toDailyWeather(dto: OpenMeteoDailyDto): DailyWeather[] {
  return dto.time.map((iso, i) => ({
    date: new Date(iso),
    temperature: { minC: dto.temperature_2m_min[i], maxC: dto.temperature_2m_max[i] },
    precipitationMm: dto.precipitation_sum[i],
    snowfallCm: dto.snowfall_sum[i],
    wind: { maxKmh: dto.wind_speed_10m_max[i], gustsKmh: dto.wind_gusts_10m_max[i] },
    cloudCoverPct: dto.cloud_cover_mean[i],
    uvIndexMax: dto.uv_index_max[i],
    sunshineHours: dto.sunshine_duration[i] / 3600,
    weatherCode: dto.weather_code[i],
  }));
}
```

### GraphQL resolvers — thin

```ts
export const buildResolvers = (deps: { rankActivities: RankActivitiesUseCase }) => ({
  Query: {
    rankActivities: async (_p, args) => {
      const input = RankActivitiesInputSchema.parse(args);
      const result = await deps.rankActivities.execute(input);
      return toGraphQL(result);
    },
  },
  RankActivitiesResult: {
    __resolveType: (r) => (r.kind === 'Ok' ? 'RankingSuccess' : 'AmbiguousLocation'),
  },
});
```

Resolvers: **validate, delegate, map**. No business logic.

---

## 4. Domain modelling

```ts
export interface Location {
  id: string;
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface DailyWeather {
  date: Date;
  temperature: { minC: number; maxC: number };
  precipitationMm: number;
  snowfallCm: number;
  wind: { maxKmh: number; gustsKmh: number };
  cloudCoverPct: number;
  uvIndexMax: number;
  sunshineHours: number;
  weatherCode: number;
}

export interface DailyScore { value: number; components: Record<string, number>; }

export interface RankedForecast {
  activity: Activity;
  dailyScores: Array<{ date: Date; score: DailyScore }>;
  bestDay: { date: Date; score: DailyScore };
  overallScore: number;
}
```

### GraphQL schema ≠ domain 1:1

- GraphQL `Ranking` includes computed fields (`bestDay.reason: String`).
- Dates become ISO strings at boundary.
- Union `RankActivitiesResult` doesn't exist in domain.

Mapping layer: `adapters/inbound/graphql/mappers.ts`. Pure, unit-tested.

---

## 5. Extensibility scenarios (debrief cheat sheet)

| Scenario | Change surface | Talking point |
|---|---|---|
| **New activity** | Add scorer file + register + enum + config weights | Zero changes to use case, ports, adapters |
| **Swap Open-Meteo → Météo-France** | New adapter folder implementing same ports; change 2 lines in composition root | Adapters are the substitution seam |
| **30-day forecast option** | Add `days` param to `WeatherPort` and GraphQL input | Port designed for it from day 1 |
| **Multi-provider fallback** | `CompositeWeatherAdapter implements WeatherPort` that fans out and reduces | Composite over the port |
| **Personalization (weight overrides)** | Use case accepts `Partial<ScoringConfig>` overrides | Scorers stateless, registry immutable |
| **Persistence (favorites)** | Add `FavoritesRepositoryPort` + Postgres adapter | Hexagon absorbs it |

---

## 6. Trade-offs section — first-class deliverable

```markdown
## Trade-offs & what I'd do next

### Deliberately cut
- **No auth.** Public endpoint. Adding auth = one middleware + a `UserContext`.
- **UI is minimal.** One page, minimal design system.
- **No dockerfile / no CI.** (or: include them — we have time)

### Known limitations
1. **Weather-code semantics live in UI.** Should be a domain mapper.
2. **Ambiguous-location UX assumes client re-queries by id.** Better: two-step flow with token.

### If this were production
- Structured logging (pino) + request ids.
- OpenTelemetry traces around use case and each adapter call.
- Contract tests against recorded Open-Meteo fixture.
- Persisted GraphQL queries + APQ.
- Rate-limit endpoint per IP.
```

Tone: **specific, quantified, action-verb'd**.

---

## 7. Scaling considerations

1. **Cache layer.** Key = `${normalisedCity}:${YYYYMMDD}:${forecastDays}`. TTL = 1h for forecast, 30d for geocoding.
2. **Rate limiting.** Token bucket around Open-Meteo adapter; per-IP rate limit on GraphQL.
3. **Multi-provider strategy.** `CompositeWeatherAdapter` with primary/fallback.
4. **Background pre-warm.** Cron for top-100 cities at 00:05 local time.
5. **CDN + static frontend.**
6. **Persisted GraphQL queries.** Client sends hash, server has query.
7. **DataLoader** if schema grows.
8. **Observability.** Metrics per scorer, per adapter, per use case.
9. **Cost control.** Cache aggressively — upstream latency dominates.

---

## 8. Monorepo folder structure

pnpm workspaces + TypeScript project references + GraphQL Code Generator + Turborepo (optional).

```
weather-activities/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
├── tsconfig.base.json
├── .nvmrc
├── README.md
│
├── packages/
│   ├── contracts/                      # SHARED — schema is contract
│   │   ├── package.json                # name: "@wa/contracts"
│   │   ├── schema.graphql
│   │   ├── codegen.ts
│   │   └── src/
│   │       ├── generated/
│   │       └── index.ts
│   │
│   ├── server/
│   │   ├── package.json                # name: "@wa/server"
│   │   ├── tsconfig.json               # references: [{ path: "../contracts" }]
│   │   ├── src/                        # (§1 tree)
│   │   └── tests/
│   │       ├── unit/
│   │       ├── integration/
│   │       └── contract/
│   │
│   └── web/
│       ├── package.json                # name: "@wa/web"
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── app/
│           ├── features/
│           │   └── ranking/
│           │       ├── ranking.page.tsx
│           │       ├── ranking.query.graphql
│           │       ├── ranking.hook.ts
│           │       └── components/
│           ├── lib/
│           └── main.tsx
```

**Why this signals seniority:**
- Shared `contracts` package proves you think in interfaces first.
- Feature-sliced `web` layout (`features/`) — modern FE consensus.
- `server/src` mirrors hexagon.
- Tests split by kind. Contract tests own layer.

---

## 9. Testing seams

| Layer | Test type | What it looks like |
|---|---|---|
| **Scorers** (domain) | Pure unit — no mocks | `expect(new SkiScorer(cfg).score(perfectSkiDay).value).toBeGreaterThan(90)` |
| **Use case** | Integration with fake ports | Wire `InMemoryGeocoding`, `StubWeather`; assert ranking shape |
| **Open-Meteo adapters** | Contract test | `msw`/nock intercepts, returns recorded response fixture |
| **GraphQL resolver** | Thin — usually don't test | If tested: `graphql` `execute` against schema with stubbed use case |
| **Composition root** | Smoke — boot + query | Proves wiring |
| **Frontend** | Component + E2E | RTL for `ActivityCard`; Playwright for happy path |

**Test doubles:**
- `InMemoryGeocodingAdapter` — accepts a `Map<string, Location[]>`.
- `StubWeatherAdapter` — accepts a `DailyWeather[]`.
- `FakeClock` — returns fixed date.

Live in `packages/server/tests/support/`.

---

## 10. Anti-patterns to avoid

**Over-abstraction (loses points)**
- DI container (tsyringe, InversifyJS, NestJS).
- Event bus / CQRS / mediators.
- Base classes (`AbstractScorer`, `BaseAdapter`).
- Wrapper libraries around `fetch`.
- Custom `Result<T, E>` monad.

**Under-abstraction (fails outright)**
- Business logic in resolvers.
- `fetch('open-meteo...')` called anywhere outside `adapters/outbound/open-meteo/`.
- Open-Meteo field names leaking into domain or GraphQL schema.
- Weights hardcoded inside scorer methods.
- One giant `WeatherService` class doing everything.

**Provider coupling in domain (classic senior red flag)**
- Domain types with fields named after external APIs.
- Domain functions taking `OpenMeteoResponse` as parameter.

**Input validation (missing = intern signal)**
- Validate at inbound adapter boundary (resolver) using zod.
- Never `parseInt(userInput)` without bounds.

**Silent failures (unforgivable)**
- Every adapter throws typed errors: `GeocodingError`, `WeatherProviderError`.
- Log underlying cause with context; never `catch {}`.

---

## Appendix A — Reviewer checklist

- [ ] `domain/` has zero imports from `adapters/`, `ports/`, or `application/`.
- [ ] `ports/` has zero imports from `adapters/`.
- [ ] Every port has at least one fake in `tests/support/`.
- [ ] Every scorer has ≥3 unit tests.
- [ ] Adapter has a mapper module distinct from HTTP client.
- [ ] GraphQL schema in `packages/contracts/` — shared artifact.
- [ ] `composition-root.ts` is the only file constructing adapters.
- [ ] Input validated at resolver with schema library.
- [ ] Ambiguous locations are first-class domain concept.
- [ ] Scores include a breakdown, not just a number.
- [ ] README has: run steps, architecture diagram, trade-offs, "what next."

---

## Appendix B — The 90-second whiteboard pitch

> "I structured it as ports and adapters. Core is a pure ranking domain: `DailyWeather`, `ActivityScorer` strategies in a small registry, single use case `RankActivitiesForCity`. Talks to outside through four ports — geocoding, weather, clock, cache — and Open-Meteo lives behind two adapters that map DTOs to domain types. GraphQL is another adapter on the inbound side; resolvers validate, call the use case, map result to schema.
>
> Three seams I care about: swap Open-Meteo → new adapter, same port, one line in composition root. Add a new activity → new file implementing `ActivityScorer`, one line to register. Personalized weights → scoring config injected, becomes a use-case parameter."
