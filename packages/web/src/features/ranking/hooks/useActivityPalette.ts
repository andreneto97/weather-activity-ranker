import { useEffect } from 'react';
import { type ActivityKind, applyPalette } from '../../../lib/palette.js';

/**
 * Applies the OKLCH palette for the selected activity to :root CSS vars.
 * Any styled element referencing `var(--activity-*)` will cross-fade via the
 * global `transition: background 500ms ease` on body (see globals.css).
 */
export function useActivityPalette(activity: ActivityKind): void {
  useEffect(() => {
    applyPalette(activity);
  }, [activity]);
}
