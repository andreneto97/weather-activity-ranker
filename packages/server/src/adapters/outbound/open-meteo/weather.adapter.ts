import type { DailyWeather } from '../../../domain/daily-weather.js';
import type { Location } from '../../../domain/location.js';
import type { HttpClient } from '../../../infrastructure/http.js';
import type { WeatherPort } from '../../../ports/weather.port.js';
import { ForecastResponseSchema } from './dto.js';
import { toDailyWeather } from './mappers.js';
import { OPEN_METEO_PROVIDERS, OPEN_METEO_URLS } from './urls.js';

/**
 * Fixed daily variable superset. Adapters don't customise per activity —
 * a single request covers every scorer's needs and the payload is small.
 */
const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'precipitation_sum',
  'precipitation_probability_max',
  'snowfall_sum',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'cloud_cover_mean',
  'uv_index_max',
  'sunshine_duration',
].join(',');

/**
 * Open-Meteo Forecast API adapter. Returns exactly `days` entries or throws
 * UpstreamError (via HttpClient).
 *
 * See specs/03-open-meteo-adapters.spec.md §Weather adapter.
 */
export function createOpenMeteoWeatherAdapter(http: HttpClient): WeatherPort {
  return {
    async getDailyForecast(loc: Location, days: number): Promise<readonly DailyWeather[]> {
      const dto = await http.getJson({
        url: OPEN_METEO_URLS.forecast,
        params: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          timezone: loc.timezone,
          forecast_days: days,
          daily: DAILY_VARS,
        },
        provider: OPEN_METEO_PROVIDERS.forecast,
        schema: ForecastResponseSchema,
      });
      return toDailyWeather(dto);
    },
  };
}
