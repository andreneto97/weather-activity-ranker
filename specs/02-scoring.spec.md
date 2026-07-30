# 02 — Scoring

## Purpose

Compute a 0–100 desirability score for each activity on each day using pure functions. The Strategy pattern lets new activities be added by dropping a single file.

## Location: `packages/server/src/domain/scoring/`

## Interface

```ts
export interface ActivityScorer {
  readonly activity: ActivityKind;
  // context bundles the extra data streams; scorers ignore what they don't need
  score(day: DailyWeather, context: ScoringContext): Score;
}

export interface ScoringContext {
  readonly marine?: MarineDaily;             // present only when activity=SURFING
  readonly airQuality?: AirQualityDaily;     // present only when activity=OUTDOOR_SIGHTSEEING
  readonly weights: ScoringWeights;          // injected from config
}
```

Each scorer file exports one `ActivityScorer` implementation and a factory that binds weights:

```ts
export const createSkiScorer = (weights: SkiWeights): ActivityScorer => ({
  activity: 'SKIING',
  score(day, ctx) { … },
});
```

## Weights

Weights live in `packages/server/src/config/scoring.config.ts` and are injected into each scorer's factory at composition time.

```ts
export interface SkiWeights {
  readonly freshSnow: number;    // 0.40 default
  readonly coldEnough: number;   // 0.30
  readonly lowWind: number;      // 0.20
  readonly visibility: number;   // 0.10
}

export interface SurfWeights {
  readonly swellHeight: number;  // 0.35 default
  readonly cleanSwell: number;   // 0.30
  readonly lightWind: number;    // 0.25
  readonly warmEnough: number;   // 0.10
}

export interface OutdoorWeights {
  readonly comfortTemp: number;  // 0.30
  readonly noRain: number;       // 0.30
  readonly sunshine: number;     // 0.20
  readonly moderateUv: number;   // 0.10
  readonly cleanAir: number;     // 0.10  (dropped + renormalized if no AQI)
}

export interface IndoorWeights {
  readonly rainy: number;        // 0.40
  readonly uncomfortableTemp: number; // 0.30
  readonly overcast: number;     // 0.20
  readonly windy: number;        // 0.10
}

export interface ScoringWeights {
  readonly ski: SkiWeights;
  readonly surf: SurfWeights;
  readonly outdoor: OutdoorWeights;
  readonly indoor: IndoorWeights;
}
```

Each weight object must satisfy `∑ ≤ 1` (dev assertion in `weightedSum`).

## Registry

```ts
export class UnknownScorerError extends Error {
  constructor(kind: ActivityKind) { super(`No scorer registered for ${kind}`); }
}

export class ScorerRegistry {
  private readonly scorers = new Map<ActivityKind, ActivityScorer>();
  register(s: ActivityScorer): this { this.scorers.set(s.activity, s); return this; }
  all(): readonly ActivityScorer[] { return [...this.scorers.values()]; }
  get(a: ActivityKind): ActivityScorer {
    const s = this.scorers.get(a);
    if (!s) throw new UnknownScorerError(a);
    return s;
  }
}
```

Registration happens in `composition-root.ts` — fluent API. `UnknownScorerError` is a programmer error, not a domain error (unreachable if registry populated correctly).

## Scoring math utilities (`scoring/util.ts`)

All pure, well-tested with fast-check.

```ts
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export const clamp100Int = (x: number): number =>
  Math.max(0, Math.min(100, Math.round(x)));

/**
 * Piecewise triangular returning [0, 1]. Single-point peak at `ideal`.
 *
 *   1 |          /\
 *     |         /  \
 *     |        /    \
 *   0 |_______/      \_______
 *          leftZero    rightZero
 *                ↑
 *              ideal
 *
 * Implementation:
 *   - returns 0 for x ≤ leftZero
 *   - ramps linearly 0 → 1 across (leftZero, ideal)
 *   - returns 1 at x === ideal (single-point peak)
 *   - ramps linearly 1 → 0 across (ideal, rightZero)
 *   - returns 0 for x ≥ rightZero
 *
 * Constraints: leftZero < ideal < rightZero. Throws otherwise (programmer error).
 */
export const bell = (x: number, leftZero: number, ideal: number, rightZero: number): number => { … };

/** Linear ramp: 0 at `zero`, 1 at `full`, clamped. Assumes zero < full. */
export const ramp = (x: number, zero: number, full: number): number => { … };

/** Linear ramp inverted: 1 at `full`, 0 at `zero`, clamped. Assumes full < zero. */
export const rampDown = (x: number, full: number, zero: number): number => { … };

/**
 * Weighted combination → 0..100 int + breakdown.
 *
 * 1. Dev-asserts ∑weight ≤ 1 + ε (throws in NODE_ENV=test, logs in prod).
 * 2. clamp01 each value.
 * 3. total = ∑(weight * clampedValue)  // ∈ [0, 1]
 * 4. value = clamp100Int(total * 100)  // HARD CLAMP guarantees [0, 100] even if weights sum > 1 in prod
 * 5. Sort components by weight desc (stable — original order preserved for ties).
 */
export const weightedSum = (
  parts: ReadonlyArray<{ label: string; weight: number; value: number }>,
): Score => { … };

/**
 * Same as weightedSum but re-normalizes weights to sum to 1 before computing.
 * Used by outdoor scorer when AQI is unavailable (drop that component, rescale others).
 * Skips the ∑weight ≤ 1 dev-assertion since renormalization guarantees exactly 1.
 */
export const weightedSumRenormalized = (
  parts: ReadonlyArray<{ label: string; weight: number; value: number }>,
): Score => { … };

/** For "not applicable" cases (Chamonix + Surfing). */
export const notApplicableScore = (reason: string): Score => ({
  value: 0,
  components: [{ label: reason, value: 0, weight: 1 }],
});

/**
 * Builds a full RankedForecast with all-zero daily scores.
 * Used by the use case when a scorer is skipped entirely (Marine unavailable, scorer throws, etc.).
 * bestDay = day 0 (earliest date, per tie-breaker rule from spec 01).
 */
export const notApplicableRankedForecast = (
  activity: ActivityKind,
  dates: readonly string[],       // exactly 7, from the week
  reason: string,
): RankedForecast => {
  const zero = notApplicableScore(reason);
  const dailyScores = dates.map((date) => ({ date, score: zero }));
  return {
    activity,
    dailyScores,
    bestDay: dailyScores[0]!,     // earliest date wins tie
    overallScore: 0,
  };
};

```

**Note**: `safeRank` (the wrapper that catches scorer exceptions and logs via pino) is **not in domain** — it depends on `Logger`, which is infrastructure. It lives in `packages/server/src/application/safe-rank.ts` and is documented in [spec 08 §Composition root](08-use-case.spec.md). Domain stays pure.

## Scorers — formulas & weights (with justification)

Weights live in `packages/server/src/config/scoring.config.ts`. Each is commented with the domain heuristic that justifies it. Reviewers can tune without touching scorer code.

### Skiing (`ski-scorer.ts`)
Data: `DailyWeather` only (no marine).

```ts
// bell(x, leftZero, ideal, rightZero) — ramps 0→1 across [left,ideal], 1→0 across [ideal,right]
weightedSum([
  { label: 'fresh snow',   weight: 0.40, value: bell(day.snowfallCm, 0, 20, 60) },
  { label: 'cold enough',  weight: 0.30, value: bell(day.temperature.maxC, -20, -3, 5) },
  { label: 'low wind',     weight: 0.20, value: rampDown(day.wind.gustsKmh, 60, 5) },
  { label: 'visibility',   weight: 0.10, value: rampDown(day.cloudCoverPct, 100, 30) },
])
```

**Justification** (in code comments):
- **0.40 fresh snow**: OnTheSnow ranks daily powder as the single strongest predictor of ski quality.
- **0.30 cold enough**: >5 °C → melt / icy → bad even with snow. Sweet spot around −3 °C.
- **0.20 low wind**: chairlifts close ~60 km/h gusts (Vail, Whistler public policy).
- **0.10 visibility**: proxied via cloud cover. Fog degrades experience but doesn't shut mountain.

### Surfing (`surf-scorer.ts`)
Data: `DailyWeather` + `MarineDaily`. If context has no `marine`, returns `notApplicableScore("No coastal access")`.

```ts
weightedSum([
  { label: 'swell height', weight: 0.35, value: bell(marine.swellHeightMaxM, 0.3, 1.5, 4.0) },
  { label: 'clean swell',  weight: 0.30, value: ramp(marine.swellPeriodMaxS, 6, 12) },
  { label: 'light wind',   weight: 0.25, value: rampDown(day.wind.maxKmh, 25, 10) },
  { label: 'warm enough',  weight: 0.10, value: bell(day.temperature.maxC, 5, 22, 35) },
])
```

**Justification**:
- **0.35 swell height**: Surfline forecasts weight wave size heaviest for beginner-to-intermediate spots.
- **0.30 clean swell**: period ≥ 10 s = groundswell; < 7 s = local chop (Magicseaweed/Surfline norm).
- **0.25 wind**: onshore > 25 km/h ruins any swell.
- **0.10 warm**: comfort factor, less decisive.

### Outdoor sightseeing (`outdoor-scorer.ts`)
Data: `DailyWeather` + optional `AirQualityDaily`. If AQI missing, use `weightedSumRenormalized` which rescales remaining weights to sum to 1.

```ts
const parts = [
  { label: 'comfort temp',    weight: 0.30, value: bell(day.apparentTempMaxC, 5, 22, 35) },
  { label: 'no rain',         weight: 0.30, value: rampDown(day.precipitationProbabilityMaxPct, 70, 10) },
  { label: 'sunshine',        weight: 0.20, value: ramp(day.sunshineHours, 2, 8) },
  { label: 'moderate UV',     weight: 0.10, value: rampDown(day.uvIndexMax, 10, 6) },
];
if (ctx.airQuality) {
  parts.push({
    label: 'clean air',
    weight: 0.10,
    value: rampDown(ctx.airQuality.aqiMean, 100, 30),
  });
  return weightedSum(parts);
}
return weightedSumRenormalized(parts);
```

**Justification**:
- **0.30 comfort temp**: WHO 15–26 °C recommendation for outdoor activity.
- **0.30 no rain**: rain kills sightseeing more than any other factor.
- **0.20 sunshine**: photos, moods, energy.
- **0.10 UV**: only penalises extreme UV (> 8) as harmful.
- **0.10 AQI**: European AQI > 100 = "poor"; degrades pleasure but not deal-breaker.

### Indoor sightseeing (`indoor-scorer.ts`)
Data: `DailyWeather` only. **Inverse of outdoor** — museums win when the weather is bad.

```ts
// bell returns [0,1] by construction, so 1 - bell(...) is always in [0,1] — safe input to weightedSum.
weightedSum([
  { label: 'rainy',           weight: 0.40, value: ramp(day.precipitationProbabilityMaxPct, 20, 80) },
  { label: 'cold or hot',     weight: 0.30, value: 1 - bell(day.apparentTempMaxC, 5, 22, 35) },
  { label: 'overcast',        weight: 0.20, value: ramp(day.cloudCoverPct, 30, 90) },
  { label: 'windy',           weight: 0.10, value: ramp(day.wind.gustsKmh, 20, 60) },
])
```

**Justification**:
- **0.40 rainy**: the primary "museum day" trigger.
- **0.30 uncomfortable temp**: too cold or too hot pushes people indoors.
- **0.20 overcast**: bad photo light and mood → museums.
- **0.10 windy**: uncomfortable + cancels many outdoor exhibits/parks.

## Assembly (`RankedForecast` per activity)

```ts
export const rank = (
  scorer: ActivityScorer,
  week: readonly DailyWeather[],
  ctx: (day: DailyWeather) => ScoringContext,
): RankedForecast => {
  const dailyScores = week.map((day) => ({ date: day.date, score: scorer.score(day, ctx(day)) }));
  const bestDay = dailyScores.reduce((a, b) => (a.score.value >= b.score.value ? a : b));
  const top3Mean = mean(dailyScores.map((d) => d.score.value).sort((a, b) => b - a).slice(0, 3));
  return {
    activity: scorer.activity,
    dailyScores,
    bestDay,
    overallScore: Math.round(top3Mean),
  };
};
```

Ordering of `RankingResult.Ok.rankings` (sort by `overallScore` desc) is done in the use case, not here.

## Invariants (property tests)

- `∀ day, ctx`: `score(day, ctx).value ∈ [0, 100]` and is integer (guaranteed by `clamp100Int` in `weightedSum`).
- `∀ day, ctx`: each `component.value ∈ [0, 1]` (guaranteed by `clamp01` in `weightedSum`).
- `∀ day, ctx`: `score(...).components` non-empty, sorted by `weight` desc (stable — original order preserved for ties), `∑weight ≤ 1 + ε`.
- **`bell(x, l, i, r)`** returns 0 for `x ≤ l` or `x ≥ r`, 1 at `x === i`, and ramps linearly on both sides. Throws on `l ≥ i` or `i ≥ r`.
- **`ramp` / `rampDown`** are monotonic and inverse of each other on `[zero, full]`.
- **Ski monotonicity**: if `snowfallCmA < snowfallCmB` and both ≤ ideal (20 cm) with all else equal, `scoreA.value ≤ scoreB.value`.
- **Indoor inversion**: for a day where `precipitationProbabilityMaxPct` grows, indoor score grows monotonically (holding other inputs fixed).
- **Not applicable**: `surfingScorer.score(day, { weights })` (no marine in ctx) returns `notApplicableScore("No coastal access")` with `value === 0`.
- **Renormalization**: `weightedSumRenormalized([{w:0.30, v:1}, {w:0.30, v:1}])` returns `value: 100` (weights rescaled 0.30/0.60 = 0.5 each → 1.0 total).

## Rejected alternatives

| Rejected | Chose instead | Why |
|---|---|---|
| Rule engine / DSL | Plain TS functions | No dynamic behavior needed; overhead > value |
| ML model | Deterministic bell curves | No training data; explainability > accuracy for demo |
| Single float weight per variable | Piecewise curves | Bad-cold ≠ bad-hot; a single linear weight cannot capture "both extremes are bad" |
| Sum without breakdown | `ScoreComponent[]` array | UI needs to explain "why 78?"; component array is the affordance |
| Weights hardcoded in scorers | `scoring.config.ts` + factories | Per-user personalization becomes trivial later |
| Symmetric weights (0.25 × 4) | Weighted (0.40 / 0.30 / 0.20 / 0.10) | Signal that I researched domain heuristics; ready to defend each number |
