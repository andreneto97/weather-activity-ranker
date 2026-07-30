import type { AirQualityDaily } from '../../../../domain/daily-weather.js';
import type { Location } from '../../../../domain/location.js';
import type { AirQualityPort } from '../../../../ports/air-quality.port.js';
import { synthAirQuality } from './synth.js';

/**
 * Stub AQI adapter. Always returns synthetic data — the stub covers all
 * cities in our demo set (unlike real Open-Meteo AQI which has regional gaps).
 */
export class StubAirQualityAdapter implements AirQualityPort {
  async getDailyAirQuality(loc: Location, days: number): Promise<readonly AirQualityDaily[]> {
    return synthAirQuality(loc.id).slice(0, days);
  }
}
