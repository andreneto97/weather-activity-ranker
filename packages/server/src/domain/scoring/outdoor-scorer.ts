import type { DailyWeather } from '../daily-weather.js';
import type { ActivityScorer, Score, ScoringContext } from './scorer.js';
import { bell, ramp, rampDown, weightedSum, weightedSumRenormalized } from './util.js';
import type { OutdoorWeights } from './weights.js';

/**
 * Outdoor sightseeing scorer. Data sources: Forecast + Air Quality (optional).
 *
 * If AQI is unavailable, the `cleanAir` component is dropped and the remaining
 * four weights are renormalised (via weightedSumRenormalized) so the result
 * still spans the full 0..100 range instead of maxing out at 90.
 *
 *   comfortTemp : bell on apparent temp (WHO 15–26 °C sweet spot).
 *   noRain      : rampDown on precip probability (70 % ruins day).
 *   sunshine    : ramp on hours (2 = grey, 8 = radiant).
 *   moderateUv  : rampDown (10 = dangerous, 6 = safe).
 *   cleanAir    : rampDown on European AQI (100 = "poor", 30 = clean).
 *
 * See specs/02-scoring.spec.md §Outdoor sightseeing for justification.
 */
export const createOutdoorScorer = (weights: OutdoorWeights): ActivityScorer => ({
  activity: 'OUTDOOR_SIGHTSEEING',
  score(day: DailyWeather, ctx: ScoringContext): Score {
    const parts = [
      {
        label: 'comfort temp',
        weight: weights.comfortTemp,
        value: bell(day.apparentTempMaxC, 5, 22, 35),
      },
      {
        label: 'no rain',
        weight: weights.noRain,
        value: rampDown(day.precipitationProbabilityMaxPct, 10, 70),
      },
      { label: 'sunshine', weight: weights.sunshine, value: ramp(day.sunshineHours, 2, 8) },
      { label: 'moderate UV', weight: weights.moderateUv, value: rampDown(day.uvIndexMax, 6, 10) },
    ];

    if (ctx.airQuality) {
      const air = ctx.airQuality;
      return weightedSum([
        ...parts,
        { label: 'clean air', weight: weights.cleanAir, value: rampDown(air.aqiMean, 30, 100) },
      ]);
    }
    return weightedSumRenormalized(parts);
  },
});
