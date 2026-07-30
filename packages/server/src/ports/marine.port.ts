import type { MarineDaily } from '../domain/daily-weather.js';
import type { Location } from '../domain/location.js';

/**
 * Fetches N days of marine forecast (waves, swell, SST).
 * Only invoked when surfing is being scored.
 *
 * Throws NotApplicableError when the coordinates are inland or unsupported.
 * The use case catches this and swaps in notApplicableScore('No coastal access')
 * for surfing, without failing the other activities.
 *
 * See specs/01-domain-model.spec.md §Ports, specs/03-open-meteo-adapters.spec.md.
 */
export interface MarinePort {
  getDailyMarine(loc: Location, days: number): Promise<readonly MarineDaily[]>;
}
