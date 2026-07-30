import { describe, expect, it } from '@jest/globals';
import { meteoconFor, weatherLabel } from './weather-icon.js';

describe('meteoconFor', () => {
  it.each([
    [0, 'meteocons:clear-day-fill'],
    [1, 'meteocons:partly-cloudy-day-fill'],
    [3, 'meteocons:overcast-day-fill'],
    [45, 'meteocons:fog-day-fill'],
    [53, 'meteocons:drizzle-fill'],
    [56, 'meteocons:sleet-fill'],
    [63, 'meteocons:rain-fill'],
    [73, 'meteocons:snow-fill'],
    [81, 'meteocons:partly-cloudy-day-rain-fill'],
    [86, 'meteocons:partly-cloudy-day-snow-fill'],
    [95, 'meteocons:thunderstorms-day-fill'],
    [96, 'meteocons:thunderstorms-day-extreme-fill'],
  ])('maps WMO %i to %s', (code, expected) => {
    expect(meteoconFor(code)).toBe(expected);
  });

  it('falls back to the not-available icon for unknown codes', () => {
    expect(meteoconFor(999)).toBe('meteocons:not-available-fill');
  });
});

describe('weatherLabel', () => {
  it.each([
    [0, 'Clear'],
    [2, 'Mostly clear'],
    [3, 'Overcast'],
    [45, 'Fog'],
    [55, 'Drizzle'],
    [65, 'Rain'],
    [75, 'Snow'],
    [82, 'Rain showers'],
    [86, 'Snow showers'],
    [95, 'Thunderstorm'],
    [99, 'Thunderstorm with hail'],
  ])('labels WMO %i as "%s"', (code, expected) => {
    expect(weatherLabel(code)).toBe(expected);
  });

  it('labels unknown codes as "Unknown"', () => {
    expect(weatherLabel(999)).toBe('Unknown');
  });
});
