import type { DailyWeather } from '../daily-weather.js';
import type { ActivityScorer, Score, ScoringContext } from './scorer.js';
import { bell, ramp, weightedSum } from './util.js';
import type { IndoorWeights } from './weights.js';

/**
 * Indoor sightseeing scorer. **Inverse of outdoor** — museums win when weather is bad.
 *
 * `1 - bell(...)` is always in [0, 1] because bell is bounded to [0, 1] by construction.
 *
 *   rainy             : ramp up on precip prob (20 % → 80 %).
 *   uncomfortableTemp : 1 - bell(apparent temp, 5..22..35).
 *   overcast          : ramp up on cloud cover (30 % → 90 %).
 *   windy             : ramp up on gust km/h (20 → 60).
 *
 * See specs/02-scoring.spec.md §Indoor sightseeing for justification.
 */
export const createIndoorScorer = (weights: IndoorWeights): ActivityScorer => ({
  activity: 'INDOOR_SIGHTSEEING',
  score(day: DailyWeather, _ctx: ScoringContext): Score {
    return weightedSum([
      {
        label: 'rainy',
        weight: weights.rainy,
        value: ramp(day.precipitationProbabilityMaxPct, 20, 80),
      },
      {
        label: 'cold or hot',
        weight: weights.uncomfortableTemp,
        value: 1 - bell(day.apparentTempMaxC, 5, 22, 35),
      },
      { label: 'overcast', weight: weights.overcast, value: ramp(day.cloudCoverPct, 30, 90) },
      { label: 'windy', weight: weights.windy, value: ramp(day.wind.gustsKmh, 20, 60) },
    ]);
  },
});
