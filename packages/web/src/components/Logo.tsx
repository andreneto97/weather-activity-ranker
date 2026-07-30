interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * App mark — a sunrise over interlocking mountain + wave, with a small
 * "shelter" dot on the horizon. Colours are pinned (not palette-reactive) so
 * the mark keeps stable contrast regardless of which activity paints the page.
 *
 * The four visual elements each nod to one activity: sun → outdoor, peaks →
 * skiing, wave → surfing, dot → indoor.
 */
const SUN_FILL = 'oklch(72% 0.16 60)'; // warm amber
const MOUNTAIN_FILL = 'oklch(52% 0.10 240)'; // slate blue
const WAVE_STROKE = 'oklch(45% 0.08 220)'; // deep sea
const SHELTER_FILL = 'oklch(35% 0.05 260)'; // charcoal

export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <title>Weather Activity Ranker</title>
      {/* sun disc — anchored top-left, generous for presence at small px */}
      <circle cx="10" cy="10" r="5" fill={SUN_FILL} />
      {/* twin mountain peaks — sun is "behind" the taller one for depth */}
      <path d="M2 24 L11 12 L16 18 L22 10 L30 24 Z" fill={MOUNTAIN_FILL} fillOpacity="0.85" />
      {/* wave — the tide line under the horizon */}
      <path
        d="M2 28 Q7 26 12 28 T22 28 T30 28"
        stroke={WAVE_STROKE}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      {/* shelter dot — the "indoor" activity, tiny keystone right of center */}
      <circle cx="26" cy="26" r="1.2" fill={SHELTER_FILL} />
    </svg>
  );
}
