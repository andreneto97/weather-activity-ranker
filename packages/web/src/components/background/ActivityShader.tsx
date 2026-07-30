import { MeshGradient } from '@paper-design/shaders-react';
import { useReducedMotion } from 'motion/react';
import { useSettings } from '../../features/ranking/hooks/useSettings.js';
import { ACTIVITY_PALETTE, type ActivityKind } from '../../lib/palette.js';

interface ActivityShaderProps {
  activity: ActivityKind;
}

/**
 * WebGL mesh gradient tinted with the currently-selected activity's palette.
 * Absolutely positioned behind everything (see z-index).
 *
 * Motion is gated by:
 *   - OS-level `prefers-reduced-motion`
 *   - In-app toggle (SettingsProvider)
 * Falls back to `speed={0}` (still renders, just static) so the palette read
 * still lands. Component is `aria-hidden` since it carries no information.
 */
export function ActivityShader({ activity }: ActivityShaderProps) {
  const prefersReduced = useReducedMotion();
  const { reducedMotion } = useSettings();
  const shouldAnimate = !(prefersReduced || reducedMotion);

  const palette = ACTIVITY_PALETTE[activity];
  const colors = [palette.bgA, palette.bgB, palette.primary];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 opacity-60"
      style={{ contain: 'strict' }}
    >
      <MeshGradient
        colors={colors}
        speed={shouldAnimate ? 0.25 : 0}
        distortion={0.8}
        swirl={0.6}
        width="100%"
        height="100%"
      />
    </div>
  );
}
