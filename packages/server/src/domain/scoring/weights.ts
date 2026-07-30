/**
 * Weight interfaces per activity. Each object's sum must be ≤ 1 (enforced by
 * `weightedSum`'s dev assertion). Live in domain (pure types); concrete values
 * live in `config/scoring.config.ts` so they can be tuned without touching
 * scoring logic.
 *
 * Justification comments explain the *why* of each default weight.
 * See specs/02-scoring.spec.md.
 */
export interface SkiWeights {
  /** OnTheSnow's dominant predictor of ski quality. */
  readonly freshSnow: number;
  /** > 5 °C = melt / icy, kills the day even with fresh snow. */
  readonly coldEnough: number;
  /** Lifts close at ~60 km/h gusts (Vail, Whistler public policy). */
  readonly lowWind: number;
  /** Cloud cover proxy — fog degrades but doesn't close mountain. */
  readonly visibility: number;
}

export interface SurfWeights {
  /** Surfline weighs wave size heaviest for beginner-to-intermediate spots. */
  readonly swellHeight: number;
  /** ≥ 10s = groundswell; < 7s = local chop (Magicseaweed/Surfline norm). */
  readonly cleanSwell: number;
  /** Onshore wind > 25 km/h ruins any swell. */
  readonly lightWind: number;
  /** Comfort factor, less decisive. */
  readonly warmEnough: number;
}

export interface OutdoorWeights {
  /** WHO 15–26 °C recommendation for outdoor activity. */
  readonly comfortTemp: number;
  /** Rain kills sightseeing more than any other factor. */
  readonly noRain: number;
  /** Photos, moods, energy. */
  readonly sunshine: number;
  /** Only penalises extreme UV (> 8) as harmful. */
  readonly moderateUv: number;
  /** European AQI > 100 = "poor"; dropped + renormalised if AQI unavailable. */
  readonly cleanAir: number;
}

export interface IndoorWeights {
  /** Primary "museum day" trigger. */
  readonly rainy: number;
  /** Too cold or too hot pushes people indoors. */
  readonly uncomfortableTemp: number;
  /** Bad photo light and mood → museums. */
  readonly overcast: number;
  /** Uncomfortable + cancels many outdoor exhibits/parks. */
  readonly windy: number;
}

export interface ScoringWeights {
  readonly ski: SkiWeights;
  readonly surf: SurfWeights;
  readonly outdoor: OutdoorWeights;
  readonly indoor: IndoorWeights;
}
