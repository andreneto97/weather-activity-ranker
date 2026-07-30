/**
 * Open-Meteo base URLs. Centralised so tests can intercept the same strings
 * the adapters call at runtime via `undici.MockAgent`.
 * See research/01-open-meteo-api.md for provenance.
 */
export const OPEN_METEO_URLS = {
  forecast: 'https://api.open-meteo.com/v1/forecast',
  geocodingSearch: 'https://geocoding-api.open-meteo.com/v1/search',
  geocodingGet: 'https://geocoding-api.open-meteo.com/v1/get',
  marine: 'https://marine-api.open-meteo.com/v1/marine',
  airQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
} as const;

/**
 * Provider identifiers used in UpstreamError + logs. Must be stable strings
 * because the GraphQL schema exposes them via `UpstreamUnavailableError.provider`.
 */
export const OPEN_METEO_PROVIDERS = {
  forecast: 'open-meteo-forecast',
  geocoding: 'open-meteo-geocoding',
  marine: 'open-meteo-marine',
  airQuality: 'open-meteo-air-quality',
} as const;
