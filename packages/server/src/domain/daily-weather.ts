/**
 * Provider-agnostic daily weather. Adapters map raw Open-Meteo columns → this shape.
 * Fields are those actually consumed by at least one scorer (spec 02).
 * See specs/01-domain-model.spec.md.
 */
export interface DailyWeather {
  readonly date: string; // ISO date (YYYY-MM-DD) in city's local timezone
  readonly temperature: { readonly minC: number; readonly maxC: number };
  readonly apparentTempMaxC: number;
  readonly precipitationMm: number;
  readonly precipitationProbabilityMaxPct: number; // 0..100
  readonly snowfallCm: number;
  readonly wind: { readonly maxKmh: number; readonly gustsKmh: number };
  readonly cloudCoverPct: number; // 0..100 mean
  readonly uvIndexMax: number;
  readonly sunshineHours: number;
  readonly weatherCode: number; // WMO
}

/**
 * Marine data — only fetched when surfing is scored.
 * Trimmed to fields the surf scorer reads.
 * See specs/03-open-meteo-adapters.spec.md §Marine adapter.
 */
export interface MarineDaily {
  readonly date: string;
  readonly waveHeightMaxM: number;
  readonly swellHeightMaxM: number;
  readonly swellPeriodMaxS: number;
  // NOTE: fields removed since no scorer currently reads them:
  //   swellDirectionDominantDeg (would need per-beach "offshore direction")
  //   seaSurfaceTempC (air temp already dominates "warm enough")
  // Re-add if a future scorer needs them.
}

/**
 * Air-quality data — only fetched when outdoor sightseeing is scored.
 * See specs/03-open-meteo-adapters.spec.md §Air Quality adapter.
 */
export interface AirQualityDaily {
  readonly date: string;
  readonly aqiMean: number; // European AQI 0..>100
  readonly pm25MeanUgm3: number;
}
