import type { Location } from '../../../../domain/location.js';

/**
 * Curated demo cities the stub adapters know about.
 * Chosen to cover each activity's "sweet spot" — see specs/03 §dev:mock.
 */
export const STUB_CITIES: Record<string, Location> = {
  lisbon: {
    id: '2267057',
    name: 'Lisbon',
    country: 'Portugal',
    admin1: 'Lisboa',
    latitude: 38.7167,
    longitude: -9.1333,
    timezone: 'Europe/Lisbon',
    population: 517802,
  },
  chamonix: {
    id: '3027301',
    name: 'Chamonix-Mont-Blanc',
    country: 'France',
    admin1: 'Auvergne-Rhône-Alpes',
    latitude: 45.9237,
    longitude: 6.8694,
    timezone: 'Europe/Paris',
    population: 8611,
  },
  rio: {
    id: '3451190',
    name: 'Rio de Janeiro',
    country: 'Brazil',
    admin1: 'Rio de Janeiro',
    latitude: -22.9068,
    longitude: -43.1729,
    timezone: 'America/Sao_Paulo',
    population: 6320446,
  },
  london: {
    id: '2643743',
    name: 'London',
    country: 'United Kingdom',
    admin1: 'England',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
    population: 7556900,
  },
  tokyo: {
    id: '1850147',
    name: 'Tokyo',
    country: 'Japan',
    admin1: 'Tokyo',
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: 'Asia/Tokyo',
    population: 8336599,
  },
  barcelona: {
    id: '3128760',
    name: 'Barcelona',
    country: 'Spain',
    admin1: 'Catalonia',
    latitude: 41.3874,
    longitude: 2.1686,
    timezone: 'Europe/Madrid',
    population: 1620343,
  },
  // Coastal Portuguese surf sweet-spot — the suggested-cities chip and the
  // README both call this out as the surf demo target, so it must exist in
  // the offline stub or reviewers running `pnpm dev:mock` hit CityNotFound.
  ericeira: {
    id: '2267094',
    name: 'Ericeira',
    country: 'Portugal',
    admin1: 'Lisboa',
    latitude: 38.9631,
    longitude: -9.4169,
    timezone: 'Europe/Lisbon',
    population: 11408,
  },
};

/**
 * Cities known to be inland → marine stub throws NotApplicableError.
 * Real Open-Meteo Marine API returns HTTP 400 for these.
 */
export const INLAND_CITY_IDS = new Set([STUB_CITIES['chamonix']!.id]);

/** Normalise + look up a stub city. Returns `undefined` for unknown names. */
export function findStubCity(name: string): Location | undefined {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  // Try direct alias first
  if (STUB_CITIES[key]) return STUB_CITIES[key];
  // Try match by full name (case-insensitive)
  for (const city of Object.values(STUB_CITIES)) {
    if (city.name.toLowerCase() === key) return city;
    // Match on first token (e.g. "Chamonix" matches "Chamonix-Mont-Blanc")
    if (city.name.toLowerCase().split(/[-\s,]/)[0] === key) return city;
  }
  return undefined;
}
