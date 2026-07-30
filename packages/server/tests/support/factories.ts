import type { AirQualityDaily, DailyWeather, MarineDaily } from '../../src/domain/daily-weather.js';
import type { Location } from '../../src/domain/location.js';

/**
 * Test-data factories. Every test constructs just the fields it cares about;
 * defaults model a mild-mid-summer Lisbon day.
 */

export const makeLocation = (overrides: Partial<Location> = {}): Location => ({
  id: 'geo-lisbon',
  name: 'Lisbon',
  country: 'Portugal',
  admin1: 'Lisboa',
  latitude: 38.7167,
  longitude: -9.1333,
  timezone: 'Europe/Lisbon',
  population: 545_000,
  ...overrides,
});

export const makeDailyWeather = (overrides: Partial<DailyWeather> = {}): DailyWeather => ({
  date: '2026-07-28',
  temperature: { minC: 18, maxC: 26 },
  apparentTempMaxC: 26,
  precipitationMm: 0,
  precipitationProbabilityMaxPct: 10,
  snowfallCm: 0,
  wind: { maxKmh: 12, gustsKmh: 18 },
  cloudCoverPct: 20,
  uvIndexMax: 8,
  sunshineHours: 11,
  weatherCode: 0,
  ...overrides,
});

export const makeMarineDaily = (overrides: Partial<MarineDaily> = {}): MarineDaily => ({
  date: '2026-07-28',
  waveHeightMaxM: 1.5,
  swellHeightMaxM: 1.2,
  swellPeriodMaxS: 10,
  ...overrides,
});

export const makeAirQualityDaily = (overrides: Partial<AirQualityDaily> = {}): AirQualityDaily => ({
  date: '2026-07-28',
  aqiMean: 30,
  pm25MeanUgm3: 8,
  ...overrides,
});

/**
 * Convenience: 7 dates in a row starting at `startISO`.
 */
export const sevenDates = (startISO = '2026-07-28'): string[] => {
  const start = new Date(startISO);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
};

/** 7 days of DailyWeather from a template; each day gets its own date. */
export const makeWeek = (
  overrides: Partial<DailyWeather> = {},
  startISO = '2026-07-28',
): DailyWeather[] => sevenDates(startISO).map((date) => makeDailyWeather({ ...overrides, date }));

export const makeMarineWeek = (
  overrides: Partial<MarineDaily> = {},
  startISO = '2026-07-28',
): MarineDaily[] => sevenDates(startISO).map((date) => makeMarineDaily({ ...overrides, date }));

export const makeAirQualityWeek = (
  overrides: Partial<AirQualityDaily> = {},
  startISO = '2026-07-28',
): AirQualityDaily[] =>
  sevenDates(startISO).map((date) => makeAirQualityDaily({ ...overrides, date }));
