import type { DailyWeather } from '../domain/daily-weather.js';
import type { Location } from '../domain/location.js';

/**
 * Fetches N days of daily forecast for a location.
 * See specs/01-domain-model.spec.md §Ports.
 */
export interface WeatherPort {
  /**
   * @param loc — resolved Location (uses loc.timezone so daily buckets align to local midnight)
   * @param days — 1..16 (per Open-Meteo docs)
   * @returns exactly `days` entries, or throws UpstreamError
   */
  getDailyForecast(loc: Location, days: number): Promise<readonly DailyWeather[]>;
}
