import type { AirQualityDaily } from '../../src/domain/daily-weather.js';
import { NotApplicableError, UpstreamError } from '../../src/domain/errors.js';
import type { Location } from '../../src/domain/location.js';
import type { AirQualityPort } from '../../src/ports/air-quality.port.js';

/**
 * Programmable AirQualityPort. Locations without a stub throw
 * NotApplicableError (mirrors the real adapter for regions without coverage).
 */
export class StubAirQuality implements AirQualityPort {
  private readonly byLocationId = new Map<string, readonly AirQualityDaily[]>();
  private throwUpstream: string | null = null;

  set(locationId: string, week: readonly AirQualityDaily[]): this {
    if (week.length !== 7) {
      throw new Error(`StubAirQuality.set: expected 7 days, got ${week.length}`);
    }
    this.byLocationId.set(locationId, week);
    return this;
  }

  throwOn(locationId: string): this {
    this.throwUpstream = locationId;
    return this;
  }

  async getDailyAirQuality(loc: Location, days: number): Promise<readonly AirQualityDaily[]> {
    if (this.throwUpstream === loc.id) {
      this.throwUpstream = null;
      throw new UpstreamError('open-meteo-air-quality', `stub failure for ${loc.id}`);
    }
    const week = this.byLocationId.get(loc.id);
    if (!week) {
      throw new NotApplicableError('No AQI coverage', 'open-meteo-air-quality');
    }
    return week.slice(0, days);
  }
}
