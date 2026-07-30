import { describe, expect, it } from '@jest/globals';
import airQualityBarcelona from './__fixtures__/air-quality-barcelona.json' with { type: 'json' };
import forecastLisbon from './__fixtures__/forecast-lisbon.json' with { type: 'json' };
import geocodingSpringfield from './__fixtures__/geocoding-springfield.json' with { type: 'json' };
import marineRio from './__fixtures__/marine-rio.json' with { type: 'json' };
import type { AirQualityResponseDto, ForecastResponseDto, MarineResponseDto } from './dto.js';
import { toAirQualityDaily, toDailyWeather, toLocation, toMarineDaily } from './mappers.js';

describe('mappers', () => {
  describe('toDailyWeather', () => {
    it('zips column arrays into 7 row-oriented entries', () => {
      const week = toDailyWeather(forecastLisbon as ForecastResponseDto);
      expect(week).toHaveLength(7);
      expect(week[0]!.date).toBe('2026-07-28');
      expect(week[0]!.temperature).toEqual({ minC: 18, maxC: 28 });
      expect(week[0]!.wind).toEqual({ maxKmh: 12, gustsKmh: 18 });
    });

    it('converts sunshine_duration seconds → hours', () => {
      const week = toDailyWeather(forecastLisbon as ForecastResponseDto);
      // 39600 s / 3600 = 11 h
      expect(week[0]!.sunshineHours).toBe(11);
    });

    it('preserves domain field names (never leaks Open-Meteo snake_case)', () => {
      const day = toDailyWeather(forecastLisbon as ForecastResponseDto)[0]!;
      const keys = Object.keys(day);
      // camelCase, not snake_case
      expect(keys).toEqual(
        expect.arrayContaining([
          'date',
          'temperature',
          'apparentTempMaxC',
          'precipitationMm',
          'precipitationProbabilityMaxPct',
          'snowfallCm',
          'wind',
          'cloudCoverPct',
          'uvIndexMax',
          'sunshineHours',
          'weatherCode',
        ]),
      );
    });
  });

  describe('toMarineDaily', () => {
    it('zips into 7 entries with trimmed field set', () => {
      const marine = toMarineDaily(marineRio as MarineResponseDto);
      expect(marine).toHaveLength(7);
      expect(marine[0]!).toEqual({
        date: '2026-07-28',
        waveHeightMaxM: 1.2,
        swellHeightMaxM: 1.0,
        swellPeriodMaxS: 11,
      });
    });

    it('drops days whose wave fields are null (bay-cell coverage gaps)', () => {
      // Regression for Santos-style bug: coastal city whose grid cell resolves
      // to a bay slot returns nulls for individual days. Mapper must skip those
      // instead of failing the whole ranking; the use case then treats surf as
      // N/A only for the skipped days, not the whole week.
      const dto: MarineResponseDto = {
        latitude: -23.96,
        longitude: -46.33,
        timezone: 'America/Sao_Paulo',
        daily: {
          time: ['2026-07-28', '2026-07-29', '2026-07-30'],
          wave_height_max: [1.2, null, 1.4],
          swell_wave_height_max: [1.0, null, 1.1],
          swell_wave_period_max: [11, null, 12],
        },
      };
      const marine = toMarineDaily(dto);
      expect(marine.map((m) => m.date)).toEqual(['2026-07-28', '2026-07-30']);
    });
  });

  describe('toAirQualityDaily', () => {
    it('buckets hourly data into daily means', () => {
      const daily = toAirQualityDaily(airQualityBarcelona as AirQualityResponseDto);
      expect(daily).toHaveLength(7);
      // Day 1 has hours [25, 30, 40, 35] → mean = 32.5
      expect(daily[0]!.date).toBe('2026-07-28');
      expect(daily[0]!.aqiMean).toBeCloseTo(32.5, 5);
    });

    it('ignores null gaps when computing the mean', () => {
      const stub: AirQualityResponseDto = {
        latitude: 0,
        longitude: 0,
        timezone: 'UTC',
        hourly: {
          time: ['2026-07-28T00:00', '2026-07-28T06:00', '2026-07-28T12:00'],
          european_aqi: [10, null, 30], // mean over non-null = 20
          pm2_5: [null, 5, null], // mean = 5
        },
      };
      const daily = toAirQualityDaily(stub);
      expect(daily[0]!.aqiMean).toBe(20);
      expect(daily[0]!.pm25MeanUgm3).toBe(5);
    });
  });

  describe('toLocation', () => {
    it('maps Open-Meteo geocoding result to domain Location', () => {
      const first = geocodingSpringfield.results[0]!;
      const loc = toLocation(first);
      expect(loc).toEqual({
        id: '4409896',
        name: 'Springfield',
        country: 'United States',
        admin1: 'Missouri',
        latitude: 37.21533,
        longitude: -93.29824,
        timezone: 'America/Chicago',
        population: 169176,
      });
    });

    it('omits admin1 / population when absent (exactOptionalPropertyTypes)', () => {
      const loc = toLocation({
        id: 42,
        name: 'Nowhere',
        latitude: 0,
        longitude: 0,
        timezone: 'UTC',
      });
      expect(loc).not.toHaveProperty('admin1');
      expect(loc).not.toHaveProperty('population');
      expect(loc.country).toBe('Unknown');
    });
  });
});
