import type { HttpClient } from '../../../infrastructure/http.js';
import type { GeocodingPort } from '../../../ports/geocoding.port.js';
import { GeocodingGetResponseSchema, GeocodingSearchResponseSchema } from './dto.js';
import { toLocation } from './mappers.js';
import { OPEN_METEO_PROVIDERS, OPEN_METEO_URLS } from './urls.js';

/**
 * Open-Meteo Geocoding adapter.
 * See specs/03-open-meteo-adapters.spec.md §Geocoding adapter.
 */
export function createOpenMeteoGeocodingAdapter(http: HttpClient): GeocodingPort {
  return {
    async search(query, opts) {
      const dto = await http.getJson({
        url: OPEN_METEO_URLS.geocodingSearch,
        params: {
          name: query,
          count: opts?.limit ?? 5,
          language: 'en',
          format: 'json',
        },
        provider: OPEN_METEO_PROVIDERS.geocoding,
        schema: GeocodingSearchResponseSchema,
      });
      // `results` is absent when there are no matches — normalize to [].
      return (dto.results ?? []).map(toLocation);
    },

    async getById(id) {
      try {
        const dto = await http.getJson({
          url: OPEN_METEO_URLS.geocodingGet,
          params: { id },
          provider: OPEN_METEO_PROVIDERS.geocoding,
          schema: GeocodingGetResponseSchema,
        });
        return toLocation(dto);
      } catch (err) {
        // Open-Meteo returns 404 for unknown IDs. HttpClient wraps that as
        // UpstreamError('HTTP 404: ...'). Convert to null for the port contract.
        if (err instanceof Error && /HTTP 404/.test(err.message)) return null;
        throw err;
      }
    },
  };
}
