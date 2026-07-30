import type { AirQualityDaily } from '../domain/daily-weather.js';
import type { Location } from '../domain/location.js';

/**
 * Fetches N days of AQI data (European AQI + PM2.5). Only invoked when outdoor
 * sightseeing is being scored.
 *
 * Throws NotApplicableError when coverage is unavailable for the region.
 * The outdoor scorer's `weightedSumRenormalized` handles this by simply
 * skipping the AQI component and rescaling the remaining weights.
 *
 * See specs/01-domain-model.spec.md §Ports, specs/03-open-meteo-adapters.spec.md.
 */
export interface AirQualityPort {
  getDailyAirQuality(loc: Location, days: number): Promise<readonly AirQualityDaily[]>;
}
