import type { DailyWeather } from '../daily-weather.js';
import type { ActivityScorer, Score, ScoringContext } from './scorer.js';
import { bell, notApplicableScore, ramp, rampDown, weightedSum } from './util.js';
import type { SurfWeights } from './weights.js';

/**
 * Surfing scorer. Data sources: Forecast + Marine.
 *
 * When Marine data isn't available (inland cities like Chamonix), returns
 * `notApplicableScore('No coastal access')` — a first-class "not applicable"
 * signal, not an error.
 *
 *   swellHeight : bell around 1.5 m (0.3 = ankle-slappers, 4.0 = terrifying).
 *   cleanSwell  : ramp on period seconds (6 = local chop, 12 = clean groundswell).
 *   lightWind   : rampDown on max km/h (10 = calm, 25 = onshore-ruined).
 *   warmEnough  : bell on air temp (comfort, not decisive).
 *
 * See specs/02-scoring.spec.md §Surfing for justification.
 */
export const createSurfScorer = (weights: SurfWeights): ActivityScorer => ({
  activity: 'SURFING',
  score(day: DailyWeather, ctx: ScoringContext): Score {
    if (!ctx.marine) {
      return notApplicableScore('No coastal access');
    }
    const marine = ctx.marine;
    return weightedSum([
      {
        label: 'swell height',
        weight: weights.swellHeight,
        value: bell(marine.swellHeightMaxM, 0.3, 1.5, 4.0),
      },
      {
        label: 'clean swell',
        weight: weights.cleanSwell,
        value: ramp(marine.swellPeriodMaxS, 6, 12),
      },
      {
        label: 'light wind',
        weight: weights.lightWind,
        value: rampDown(day.wind.maxKmh, 10, 25),
      },
      {
        label: 'warm enough',
        weight: weights.warmEnough,
        value: bell(day.temperature.maxC, 5, 22, 35),
      },
    ]);
  },
});
