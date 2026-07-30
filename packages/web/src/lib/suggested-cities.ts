import type { ActivityKind } from './palette.js';

/**
 * Chips shown on the landing page + in the ⌘K "popular" section.
 * Curated so each activity has an obvious "sweet spot" city.
 */
export interface SuggestedCity {
  readonly name: string;
  readonly activity: ActivityKind;
  readonly emoji: string;
  readonly hint: string;
}

export const SUGGESTED_CITIES: readonly SuggestedCity[] = [
  { name: 'Chamonix', activity: 'SKIING', emoji: '⛷️', hint: 'Alpine skiing' },
  { name: 'Ericeira', activity: 'SURFING', emoji: '🏄', hint: 'Portuguese surf mecca' },
  { name: 'Barcelona', activity: 'OUTDOOR_SIGHTSEEING', emoji: '🌞', hint: 'Sunny sightseeing' },
  { name: 'London', activity: 'INDOOR_SIGHTSEEING', emoji: '🏛️', hint: 'Museums + rain' },
];
