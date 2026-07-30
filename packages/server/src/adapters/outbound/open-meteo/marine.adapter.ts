import type { MarineDaily } from '../../../domain/daily-weather.js';
import { NotApplicableError, UpstreamError } from '../../../domain/errors.js';
import type { Location } from '../../../domain/location.js';
import type { HttpClient } from '../../../infrastructure/http.js';
import type { MarinePort } from '../../../ports/marine.port.js';
import { MarineResponseSchema } from './dto.js';
import { toMarineDaily } from './mappers.js';
import { OPEN_METEO_PROVIDERS, OPEN_METEO_URLS } from './urls.js';

const DAILY_VARS = ['wave_height_max', 'swell_wave_height_max', 'swell_wave_period_max'].join(',');

/**
 * Open-Meteo Marine adapter. Inland cities return HTTP 400 with a JSON error
 * body — we translate that to NotApplicableError so the use case can degrade
 * the surfing activity gracefully without failing the whole request.
 *
 * See specs/03-open-meteo-adapters.spec.md §Marine adapter.
 */
export function createOpenMeteoMarineAdapter(http: HttpClient): MarinePort {
  return {
    async getDailyMarine(loc: Location, days: number): Promise<readonly MarineDaily[]> {
      try {
        const dto = await http.getJson({
          url: OPEN_METEO_URLS.marine,
          params: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            timezone: loc.timezone,
            forecast_days: days,
            // `cell_selection=sea` forces the nearest OCEAN grid cell. Without
            // it (or with `nearest`), coastal cities whose centroid sits over
            // a bay/estuary (Santos, Piraeus, Sydney Harbour) get a land cell
            // that returns null for every wave field — breaks the surfing
            // scorer with a schema-mismatch error even though open water is
            // a few km away. `sea` returns HTTP 400 for truly inland cities,
            // which we already handle as NotApplicableError below.
            cell_selection: 'sea',
            length_unit: 'metric',
            daily: DAILY_VARS,
          },
          provider: OPEN_METEO_PROVIDERS.marine,
          schema: MarineResponseSchema,
        });
        return toMarineDaily(dto);
      } catch (err) {
        // Inland / unsupported → HTTP 400 with { error: true, reason: "..." }
        if (err instanceof UpstreamError && /HTTP 400/.test(err.message)) {
          throw new NotApplicableError('No coastal data', OPEN_METEO_PROVIDERS.marine);
        }
        throw err;
      }
    },
  };
}
