/**
 * Offline stub adapters used when `OPEN_METEO_MODE=stub`.
 *
 * Behaviour matches the real adapters' contracts:
 *   - Weather always returns a plausible 7-day week (fixtures when known,
 *     synthetic mild-summer otherwise).
 *   - Marine throws NotApplicableError for inland cities.
 *   - AQI throws NotApplicableError for regions without coverage.
 *   - Geocoding returns curated candidates for the demo cities + ambiguity
 *     for "Springfield".
 *
 * Used by:
 *   - `pnpm dev:mock` for offline development
 *   - Playwright E2E to keep the suite deterministic + offline
 *
 * See specs/03-open-meteo-adapters.spec.md §Stub adapter contract.
 */

export { StubGeocodingAdapter } from './geocoding.stub.js';
export { StubWeatherAdapter } from './weather.stub.js';
export { StubMarineAdapter } from './marine.stub.js';
export { StubAirQualityAdapter } from './air-quality.stub.js';
