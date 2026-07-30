import { describe, expect, it } from '@jest/globals';
import { formatDayMonth, formatPopulation, formatTemperature, formatWeekday } from './format.js';

describe('formatTemperature', () => {
  it('rounds and formats celsius with °C when metric', () => {
    expect(formatTemperature(21.4, 'metric')).toBe('21°C');
    expect(formatTemperature(21.6, 'metric')).toBe('22°C');
  });

  it('converts to fahrenheit and rounds when imperial', () => {
    expect(formatTemperature(0, 'imperial')).toBe('32°F');
    expect(formatTemperature(100, 'imperial')).toBe('212°F');
    expect(formatTemperature(21, 'imperial')).toBe('70°F');
  });
});

describe('formatWeekday', () => {
  it('returns a short weekday name in the given IANA timezone', () => {
    // 2026-07-30 at 12:00 UTC = Thursday everywhere sensible
    expect(formatWeekday('2026-07-30', 'Europe/Lisbon')).toBe('Thu');
    expect(formatWeekday('2026-07-30', 'Asia/Tokyo')).toBe('Thu');
  });

  it('falls back to runtime tz when timezone is invalid', () => {
    expect(formatWeekday('2026-07-30', 'Not/A_Zone')).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
  });
});

describe('formatDayMonth', () => {
  it('returns short-month day in the given IANA timezone', () => {
    expect(formatDayMonth('2026-07-30', 'Europe/Lisbon')).toBe('Jul 30');
  });

  it('falls back to a slice of the ISO date on invalid tz', () => {
    expect(formatDayMonth('2026-07-30', 'Not/A_Zone')).toBe('07-30');
  });
});

describe('formatPopulation', () => {
  it('returns empty string for missing values (undefined, null, 0)', () => {
    expect(formatPopulation(undefined)).toBe('');
    expect(formatPopulation(null)).toBe('');
    expect(formatPopulation(0)).toBe('');
  });

  it('formats sub-1k as-is', () => {
    expect(formatPopulation(500)).toBe('500');
  });

  it('formats thousands with k suffix', () => {
    expect(formatPopulation(11_408)).toBe('11k');
    expect(formatPopulation(517_802)).toBe('518k');
  });

  it('formats millions with one decimal + M suffix', () => {
    expect(formatPopulation(6_320_446)).toBe('6.3M');
    expect(formatPopulation(8_336_599)).toBe('8.3M');
  });
});
