import type { MarineDaily } from '../../../../domain/daily-weather.js';
import { NotApplicableError } from '../../../../domain/errors.js';
import type { Location } from '../../../../domain/location.js';
import type { MarinePort } from '../../../../ports/marine.port.js';
import { OPEN_METEO_PROVIDERS } from '../urls.js';
import { INLAND_CITY_IDS } from './cities.js';
import { synthMarine } from './synth.js';

/**
 * Stub marine adapter. Inland cities (Chamonix in our demo set) throw
 * NotApplicableError — matches the real adapter's behaviour on HTTP 400.
 */
export class StubMarineAdapter implements MarinePort {
  async getDailyMarine(loc: Location, days: number): Promise<readonly MarineDaily[]> {
    if (INLAND_CITY_IDS.has(loc.id)) {
      throw new NotApplicableError('No coastal data', OPEN_METEO_PROVIDERS.marine);
    }
    return synthMarine(loc.id).slice(0, days);
  }
}
