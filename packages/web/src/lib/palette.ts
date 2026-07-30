/**
 * Activity → OKLCH palette. Each activity has:
 *   - primary: accent for buttons, focus rings, best-day glow, meta theme-color
 *   - bgA / bgB: gradient stops for the shader background
 *
 * OKLCH is used because interpolation between stops looks perceptually smooth
 * (RGB gradients often go through muddy midtones). See
 * research/06-ui-ux-inspiration.md.
 *
 * Runtime: `useActivityPalette(activity)` sets the CSS vars `--activity-primary`,
 * `--activity-bg-a`, `--activity-bg-b` on `:root` (and updates <meta theme-color>),
 * so every styled element with `var(--activity-primary)` reacts on change.
 */

// Derived from the codegen enum so the schema is the single source of truth.
// Adding an activity to the schema surfaces here as a TS error at every
// exhaustive site (palette record, switch statements, tests). Template literal
// type flattens the enum to its string union: `"SKIING" | "SURFING" | …`.
import type { ActivityKind as GqlActivityKind } from '../gql/graphql.js';
export type ActivityKind = `${GqlActivityKind}`;

export interface Palette {
  readonly primary: string;
  readonly bgA: string;
  readonly bgB: string;
}

export const ACTIVITY_PALETTE: Record<ActivityKind, Palette> = {
  SKIING: {
    primary: 'oklch(75% 0.08 235)', // icy alpine blue
    bgA: 'oklch(96% 0.03 230)',
    bgB: 'oklch(85% 0.06 240)',
  },
  SURFING: {
    primary: 'oklch(68% 0.13 200)', // teal ocean
    bgA: 'oklch(92% 0.05 195)',
    bgB: 'oklch(75% 0.11 205)',
  },
  OUTDOOR_SIGHTSEEING: {
    primary: 'oklch(75% 0.15 90)', // golden hour
    bgA: 'oklch(95% 0.05 85)',
    bgB: 'oklch(80% 0.13 100)',
  },
  INDOOR_SIGHTSEEING: {
    primary: 'oklch(60% 0.10 45)', // warm amber
    bgA: 'oklch(93% 0.03 50)',
    bgB: 'oklch(75% 0.08 40)',
  },
};

/**
 * Apply the palette to :root so every `var(--activity-*)` reference updates.
 * Also updates the browser chrome color (mobile PWA / address bar).
 */
export function applyPalette(activity: ActivityKind): void {
  const palette = ACTIVITY_PALETTE[activity];
  const root = document.documentElement;
  root.style.setProperty('--activity-primary', palette.primary);
  root.style.setProperty('--activity-bg-a', palette.bgA);
  root.style.setProperty('--activity-bg-b', palette.bgB);

  const meta = document.getElementById('theme-color-meta');
  if (meta instanceof HTMLMetaElement) {
    // Note: theme-color must be a resolvable CSS color; OKLCH is supported in
    // modern mobile browsers (Chrome / Safari 16.4+). Older UAs ignore the meta.
    meta.content = palette.primary;
  }
}
