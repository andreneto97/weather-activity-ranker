import type { ActivityKind } from '../activity.js';
import type { AirQualityDaily, DailyWeather, MarineDaily } from '../daily-weather.js';
import type { ScoringWeights } from './weights.js';

/**
 * One contributing factor of a Score. Weights sum ≤ 1 across all components.
 * See specs/01-domain-model.spec.md, specs/02-scoring.spec.md.
 */
export interface ScoreComponent {
  readonly label: string; // "fresh snow", "low wind"
  readonly value: number; // 0..1 normalized contribution
  readonly weight: number; // 0..1 weight of this component
}

/**
 * A 0..100 integer desirability score plus its breakdown.
 * Components are sorted by weight desc (stable — ties preserve original order).
 */
export interface Score {
  readonly value: number; // 0..100 (Math.round)
  readonly components: readonly ScoreComponent[];
}

/**
 * Score attached to a specific day. `weather` is the raw forecast for the
 * day — attached by `rank()` so downstream consumers (GraphQL DayCard, DayDetail)
 * can render the WMO code, temperature, and precipitation without a second query.
 *
 * Optional because `notApplicableRankedForecast` (used only when a scorer throws)
 * has no weather to attach. Legitimate not-applicable days (e.g. surfing inland)
 * still have weather because `rank()` runs normally — the scorer just returns 0.
 */
export interface DailyScore {
  readonly date: string;
  readonly score: Score;
  readonly weather?: DailyWeather;
}

/**
 * Auxiliary data plumbed into every scorer call. Optional fields are only present
 * when their upstream fetch succeeded (marine only for surfing, AQI only for outdoor).
 * See specs/08-use-case.spec.md §Orchestration step 5.
 */
export interface ScoringContext {
  readonly marine?: MarineDaily;
  readonly airQuality?: AirQualityDaily;
  readonly weights: ScoringWeights;
}

/**
 * Strategy interface: one implementation per activity, registered in ScorerRegistry.
 * Pure function of (day, ctx). Adding a new activity is one file + one registry
 * `.register()` line.
 */
export interface ActivityScorer {
  readonly activity: ActivityKind;
  score(day: DailyWeather, ctx: ScoringContext): Score;
}
