import type { AirQualityDaily } from '../../../domain/daily-weather.js';
import { NotApplicableError, UpstreamError } from '../../../domain/errors.js';
import type { Location } from '../../../domain/location.js';
import type { HttpClient } from '../../../infrastructure/http.js';
import type { AirQualityPort } from '../../../ports/air-quality.port.js';
import { AirQualityResponseSchema } from './dto.js';
import { toAirQualityDaily } from './mappers.js';
import { OPEN_METEO_PROVIDERS, OPEN_METEO_URLS } from './urls.js';

const HOURLY_VARS = ['european_aqi', 'pm2_5'].join(',');

/**
 * Open-Meteo Air Quality adapter. Regions without coverage return HTTP 400;
 * we translate that to NotApplicableError so the outdoor scorer degrades
 * gracefully (drops the clean-air component and renormalises weights).
 *
 * Also throws NotApplicableError if the daily aggregate has no non-null hours
 * (should not happen if the request succeeds, but defensive).
 *
 * See specs/03-open-meteo-adapters.spec.md §Air Quality adapter.
 */
export function createOpenMeteoAirQualityAdapter(http: HttpClient): AirQualityPort {
  return {
    async getDailyAirQuality(loc: Location, days: number): Promise<readonly AirQualityDaily[]> {
      try {
        const dto = await http.getJson({
          url: OPEN_METEO_URLS.airQuality,
          params: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            timezone: loc.timezone,
            forecast_days: days,
            hourly: HOURLY_VARS,
          },
          provider: OPEN_METEO_PROVIDERS.airQuality,
          schema: AirQualityResponseSchema,
        });
        const daily = toAirQualityDaily(dto);
        if (daily.length === 0) {
          throw new NotApplicableError('No AQI coverage', OPEN_METEO_PROVIDERS.airQuality);
        }
        return daily;
      } catch (err) {
        if (err instanceof NotApplicableError) throw err;
        if (err instanceof UpstreamError && /HTTP 400/.test(err.message)) {
          throw new NotApplicableError('No AQI coverage', OPEN_METEO_PROVIDERS.airQuality);
        }
        throw err;
      }
    },
  };
}
