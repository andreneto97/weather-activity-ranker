import type { ActivityKind } from '../activity.js';
import type { DailyWeather } from '../daily-weather.js';
import type { RankedForecast } from '../ranked-forecast.js';
import type {
  ActivityScorer,
  DailyScore,
  Score,
  ScoreComponent,
  ScoringContext,
} from './scorer.js';

/** Clamp x into [0, 1]. NaN maps to 0 (defensive — bad math shouldn't crash a scorer). */
export const clamp01 = (x: number): number => {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(1, x));
};

/** Round + clamp x into integer [0, 100]. Hard guarantee even if weights sum > 1 (or x is NaN). */
export const clamp100Int = (x: number): number => {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
};

/**
 * Piecewise triangular, returns [0, 1]. Single-point peak at `ideal`.
 *
 *   1 |          /\
 *     |         /  \
 *     |        /    \
 *   0 |_______/      \_______
 *          leftZero    rightZero
 *                ↑ ideal
 *
 * - `x ≤ leftZero` → 0
 * - `x` in (leftZero, ideal) → linear ramp up to 1
 * - `x === ideal` → 1
 * - `x` in (ideal, rightZero) → linear ramp down to 0
 * - `x ≥ rightZero` → 0
 *
 * Throws if `leftZero >= ideal` or `ideal >= rightZero` (programmer error).
 */
export const bell = (x: number, leftZero: number, ideal: number, rightZero: number): number => {
  if (leftZero >= ideal || ideal >= rightZero) {
    throw new Error(
      `bell: expected leftZero < ideal < rightZero, got (${leftZero}, ${ideal}, ${rightZero})`,
    );
  }
  if (x <= leftZero || x >= rightZero) return 0;
  if (x === ideal) return 1;
  return x < ideal ? (x - leftZero) / (ideal - leftZero) : (rightZero - x) / (rightZero - ideal);
};

/** Linear ramp: 0 at `zero`, 1 at `full`, clamped. Requires zero < full. */
export const ramp = (x: number, zero: number, full: number): number => {
  if (zero >= full) throw new Error(`ramp: expected zero < full, got (${zero}, ${full})`);
  return clamp01((x - zero) / (full - zero));
};

/** Linear ramp inverted: 1 at `full`, 0 at `zero`, clamped. Requires full < zero. */
export const rampDown = (x: number, full: number, zero: number): number => {
  if (full >= zero) throw new Error(`rampDown: expected full < zero, got (${full}, ${zero})`);
  return clamp01((zero - x) / (zero - full));
};

interface PartInput {
  label: string;
  weight: number;
  value: number;
}

const EPSILON = 1e-9;

/**
 * Weighted combination → Score with 0..100 int + component breakdown.
 *
 * 1. Dev-asserts ∑weight ≤ 1 + ε.
 * 2. clamp01 each incoming value (defensive — scorers should already return [0,1]).
 * 3. total = ∑(weight * clampedValue)  ∈ [0, 1]
 * 4. Hard-clamp Math.round(total * 100) into [0, 100] as final safety net.
 * 5. Components sorted by weight desc (stable — original order preserved for ties).
 */
export const weightedSum = (parts: readonly PartInput[]): Score => {
  const weightSum = parts.reduce((s, p) => s + p.weight, 0);
  if (weightSum > 1 + EPSILON) {
    throw new Error(
      `weightedSum: weights sum to ${weightSum.toFixed(4)} (must be ≤ 1). Use weightedSumRenormalized if this is intentional.`,
    );
  }
  const total = parts.reduce((s, p) => s + p.weight * clamp01(p.value), 0);
  return {
    value: clamp100Int(total * 100),
    components: sortComponentsByWeightDesc(parts.map(toComponent)),
  };
};

/**
 * Like weightedSum but rescales weights so they sum to exactly 1 first.
 * Used by outdoor scorer when AQI is unavailable (drops the AQI component,
 * rescales the remaining four).
 */
export const weightedSumRenormalized = (parts: readonly PartInput[]): Score => {
  const weightSum = parts.reduce((s, p) => s + p.weight, 0);
  if (weightSum <= 0) throw new Error('weightedSumRenormalized: total weight must be > 0');
  const rescaled: PartInput[] = parts.map((p) => ({ ...p, weight: p.weight / weightSum }));
  const total = rescaled.reduce((s, p) => s + p.weight * clamp01(p.value), 0);
  return {
    value: clamp100Int(total * 100),
    components: sortComponentsByWeightDesc(rescaled.map(toComponent)),
  };
};

const toComponent = (p: PartInput): ScoreComponent => ({
  label: p.label,
  value: clamp01(p.value),
  weight: p.weight,
});

/** Stable sort by weight desc (equal weights preserve original relative order). */
const sortComponentsByWeightDesc = (components: ScoreComponent[]): ScoreComponent[] =>
  components
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.weight - a.c.weight || a.i - b.i)
    .map(({ c }) => c);

/** Placeholder score for "not applicable" cases (Chamonix + Surfing, missing coastal data). */
export const notApplicableScore = (reason: string): Score => ({
  value: 0,
  components: [{ label: reason, value: 0, weight: 1 }],
});

/**
 * Build a full RankedForecast with all-zero daily scores.
 * Used when a scorer is skipped entirely (Marine unavailable, scorer throws).
 * bestDay = day 0 (earliest date, per tie-breaker rule from spec 01).
 */
export const notApplicableRankedForecast = (
  activity: ActivityKind,
  dates: readonly string[],
  reason: string,
): RankedForecast => {
  if (dates.length === 0) {
    throw new Error('notApplicableRankedForecast: dates must be non-empty');
  }
  const zero = notApplicableScore(reason);
  const dailyScores: DailyScore[] = dates.map((date) => ({ date, score: zero }));
  return {
    activity,
    dailyScores,
    bestDay: dailyScores[0]!, // narrowed by length check above
    overallScore: 0,
  };
};

/**
 * Assemble a RankedForecast from a week of DailyWeather.
 * - bestDay: max by score.value; ties broken by earliest date.
 * - overallScore: round(mean of top-3 scores).
 *
 * Throws if `week.length !== 7` (spec 01 invariant).
 */
export const rank = (
  scorer: ActivityScorer,
  week: readonly DailyWeather[],
  ctx: (day: DailyWeather) => ScoringContext,
): RankedForecast => {
  if (week.length !== 7) {
    throw new Error(`rank: expected 7 daily entries, got ${week.length}`);
  }
  const dailyScores: DailyScore[] = week.map((day) => ({
    date: day.date,
    score: scorer.score(day, ctx(day)),
    weather: day,
  }));

  // bestDay: max by score.value; earliest date wins ties (dailyScores are already date-ordered).
  const bestDay = dailyScores.reduce((best, current) =>
    current.score.value > best.score.value ? current : best,
  );

  // overallScore: mean of top-3 scores rounded to int.
  const top3 = [...dailyScores]
    .map((d) => d.score.value)
    .sort((a, b) => b - a)
    .slice(0, 3);
  const top3Mean = top3.reduce((s, v) => s + v, 0) / top3.length;

  return {
    activity: scorer.activity,
    dailyScores,
    bestDay,
    overallScore: Math.round(top3Mean),
  };
};
