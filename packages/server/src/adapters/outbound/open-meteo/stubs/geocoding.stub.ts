import type { Location } from '../../../../domain/location.js';
import type { GeocodingPort } from '../../../../ports/geocoding.port.js';
import { STUB_CITIES, findStubCity } from './cities.js';

/** Ambiguity fixture — shared by `search('springfield')` and `getById('sp-*')`. */
const SPRINGFIELD_CANDIDATES: readonly Location[] = [
  {
    id: 'sp-mo',
    name: 'Springfield',
    country: 'United States',
    admin1: 'Missouri',
    latitude: 37.2153,
    longitude: -93.2982,
    timezone: 'America/Chicago',
    population: 169176,
  },
  {
    id: 'sp-il',
    name: 'Springfield',
    country: 'United States',
    admin1: 'Illinois',
    latitude: 39.8017,
    longitude: -89.6437,
    timezone: 'America/Chicago',
    population: 114230,
  },
  {
    id: 'sp-ma',
    name: 'Springfield',
    country: 'United States',
    admin1: 'Massachusetts',
    latitude: 42.1015,
    longitude: -72.5898,
    timezone: 'America/New_York',
    population: 153060,
  },
];

/**
 * Stub geocoding. Returns:
 *   - Known city → single match from STUB_CITIES
 *   - "springfield" → 3 candidates to exercise the ambiguity picker
 *   - Unknown query → []
 *
 * `getById` looks up both the STUB_CITIES roster AND the Springfield candidates
 * so the AmbiguityPicker → click flow (which navigates to
 * `/city/Springfield?locationId=sp-mo`) resolves in stub mode too. Without the
 * Springfield entries in the lookup, the deep-link leg of the ambiguity flow
 * would return `CityNotFound` in Playwright/offline runs.
 */
export class StubGeocodingAdapter implements GeocodingPort {
  async search(query: string, opts?: { limit?: number }): Promise<readonly Location[]> {
    const normalized = query.trim().toLowerCase();
    if (normalized === 'springfield') {
      const limit = opts?.limit ?? 5;
      return SPRINGFIELD_CANDIDATES.slice(0, limit);
    }
    const hit = findStubCity(query);
    return hit ? [hit] : [];
  }

  async getById(id: string): Promise<Location | null> {
    for (const city of Object.values(STUB_CITIES)) {
      if (city.id === id) return city;
    }
    return SPRINGFIELD_CANDIDATES.find((c) => c.id === id) ?? null;
  }
}
