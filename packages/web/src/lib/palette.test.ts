import { describe, expect, it } from '@jest/globals';
import { ACTIVITY_PALETTE, type ActivityKind, applyPalette } from './palette.js';

const ACTIVITIES: readonly ActivityKind[] = [
  'SKIING',
  'SURFING',
  'OUTDOOR_SIGHTSEEING',
  'INDOOR_SIGHTSEEING',
];

describe('ACTIVITY_PALETTE', () => {
  it.each(ACTIVITIES)('has a complete OKLCH triplet for %s', (activity) => {
    const p = ACTIVITY_PALETTE[activity];
    expect(p.primary).toMatch(/^oklch\(/);
    expect(p.bgA).toMatch(/^oklch\(/);
    expect(p.bgB).toMatch(/^oklch\(/);
  });

  it('covers every ActivityKind (compile-time exhaustive check)', () => {
    // Adding a new ActivityKind to the codegen enum without a palette entry
    // is a TS error — this assertion is the runtime safety net.
    expect(Object.keys(ACTIVITY_PALETTE).sort()).toEqual([...ACTIVITIES].sort());
  });
});

describe('applyPalette', () => {
  it('sets the three activity CSS vars on :root', () => {
    applyPalette('SKIING');
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--activity-primary')).toBe(ACTIVITY_PALETTE.SKIING.primary);
    expect(root.getPropertyValue('--activity-bg-a')).toBe(ACTIVITY_PALETTE.SKIING.bgA);
    expect(root.getPropertyValue('--activity-bg-b')).toBe(ACTIVITY_PALETTE.SKIING.bgB);
  });

  it('updates the <meta theme-color> element when present', () => {
    const meta = document.createElement('meta');
    meta.id = 'theme-color-meta';
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);

    applyPalette('SURFING');
    expect(meta.content).toBe(ACTIVITY_PALETTE.SURFING.primary);

    meta.remove();
  });

  it('does not throw when the meta element is absent', () => {
    // No meta in the DOM — should still update CSS vars without error.
    expect(() => {
      applyPalette('OUTDOOR_SIGHTSEEING');
    }).not.toThrow();
  });
});
