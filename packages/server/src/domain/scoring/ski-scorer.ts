import type { DailyWeather } from '../daily-weather.js';
import type { ActivityScorer, Score, ScoringContext } from './scorer.js';
import { bell, rampDown, weightedSum } from './util.js';
import type { SkiWeights } from './weights.js';

/**
 * Skiing scorer. Data source: Forecast API only (no marine).
 *
 *   freshSnow  : bell around 20 cm/day (0 → 60 cm range; 0 = ideal? no — 20 is peak).
 *   coldEnough : bell around -3 °C max (any warmer = melt).
 *   lowWind    : rampDown on gust km/h (60 = 0, 5 = 1).
 *   visibility : rampDown on cloud cover pct.
 *
 * See specs/02-scoring.spec.md §Skiing for justification.
 */
export const createSkiScorer = (weights: SkiWeights): ActivityScorer => ({
  activity: 'SKIING',
  score(day: DailyWeather, _ctx: ScoringContext): Score {
    return weightedSum([
      { label: 'fresh snow', weight: weights.freshSnow, value: bell(day.snowfallCm, 0, 20, 60) },
      {
        label: 'cold enough',
        weight: weights.coldEnough,
        value: bell(day.temperature.maxC, -20, -3, 5),
      },
      { label: 'low wind', weight: weights.lowWind, value: rampDown(day.wind.gustsKmh, 5, 60) },
      {
        label: 'visibility',
        weight: weights.visibility,
        value: rampDown(day.cloudCoverPct, 30, 100),
      },
    ]);
  },
});
