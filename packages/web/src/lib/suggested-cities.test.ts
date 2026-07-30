import { describe, expect, it } from '@jest/globals';
import type { ActivityKind } from './palette.js';
import { SUGGESTED_CITIES } from './suggested-cities.js';

const ACTIVITIES: readonly ActivityKind[] = [
  'SKIING',
  'SURFING',
  'OUTDOOR_SIGHTSEEING',
  'INDOOR_SIGHTSEEING',
];

describe('SUGGESTED_CITIES', () => {
  it('provides exactly one chip per activity', () => {
    const activities = SUGGESTED_CITIES.map((c) => c.activity).sort();
    expect(activities).toEqual([...ACTIVITIES].sort());
  });

  it('every entry has a non-empty name, emoji, and hint', () => {
    for (const city of SUGGESTED_CITIES) {
      expect(city.name.length).toBeGreaterThan(0);
      expect(city.emoji.length).toBeGreaterThan(0);
      expect(city.hint.length).toBeGreaterThan(0);
    }
  });
});
