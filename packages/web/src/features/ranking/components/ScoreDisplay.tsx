import NumberFlow from '@number-flow/react';
import { useReducedMotion } from 'motion/react';
import { useSettings } from '../hooks/useSettings.js';

interface ScoreDisplayProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

/**
 * Big score number with a gradient bar underneath. Uses `@number-flow/react`
 * for a rolling-digit animation; falls back to instant render when the user
 * or their OS asks for reduced motion.
 */
export function ScoreDisplay({ value, size = 'md', label }: ScoreDisplayProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const cls =
    size === 'lg'
      ? 'text-7xl font-serif'
      : size === 'sm'
        ? 'text-2xl font-semibold'
        : 'text-4xl font-semibold';
  const prefersReduced = useReducedMotion();
  const { reducedMotion } = useSettings();
  const animated = !(prefersReduced || reducedMotion);
  return (
    <div>
      {label ? (
        <p className="mb-1 text-xs uppercase tracking-widest text-neutral-500">{label}</p>
      ) : null}
      <p className={`${cls} tabular-nums leading-none`}>
        <NumberFlow value={clamped} animated={animated} />
        <span className="ml-1 text-neutral-400 text-base">/100</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/70">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${clamped}%`,
            background:
              'linear-gradient(to right, oklch(65% 0.22 25), oklch(85% 0.15 90), oklch(70% 0.18 145))',
          }}
        />
      </div>
    </div>
  );
}
