import type { DailyWeather } from '../../../../domain/daily-weather.js';
import type { Location } from '../../../../domain/location.js';
import type { WeatherPort } from '../../../../ports/weather.port.js';
import { synthWeather } from './synth.js';

/**
 * Stub weather adapter. Returns deterministic synthetic weather seeded by
 * location.id — the same city always gets the same week (until the day
 * rolls over).
 *
 * Chamonix + winter latitude approximation → cold + occasional snowfall
 * (drives Skiing scoring); temperate lats → mild summer weather.
 */
export class StubWeatherAdapter implements WeatherPort {
  async getDailyForecast(loc: Location, days: number): Promise<readonly DailyWeather[]> {
    const week = synthWeather(loc.id, loc.latitude);
    return week.slice(0, days);
  }
}
