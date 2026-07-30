import type { DailyWeather } from '../../src/domain/daily-weather.js';
import { UpstreamError } from '../../src/domain/errors.js';
import type { Location } from '../../src/domain/location.js';
import type { WeatherPort } from '../../src/ports/weather.port.js';

/**
 * Programmable WeatherPort. Feed `set(locationId, week)` and it returns that
 * week; unknown locations throw UpstreamError by default (matches the real
 * adapter's behavior on 5xx).
 */
export class StubWeather implements WeatherPort {
  private readonly byLocationId = new Map<string, readonly DailyWeather[]>();
  private throwFor: string | null = null;

  set(locationId: string, week: readonly DailyWeather[]): this {
    if (week.length !== 7) {
      throw new Error(`StubWeather.set: expected 7 days, got ${week.length}`);
    }
    this.byLocationId.set(locationId, week);
    return this;
  }

  /** Make the next call for `locationId` throw UpstreamError. */
  throwOn(locationId: string): this {
    this.throwFor = locationId;
    return this;
  }

  async getDailyForecast(loc: Location, days: number): Promise<readonly DailyWeather[]> {
    if (this.throwFor === loc.id) {
      this.throwFor = null;
      throw new UpstreamError('open-meteo-forecast', `stub failure for ${loc.id}`);
    }
    const week = this.byLocationId.get(loc.id);
    if (!week) {
      throw new UpstreamError('open-meteo-forecast', `no stub week for ${loc.id}`);
    }
    return week.slice(0, days);
  }
}
