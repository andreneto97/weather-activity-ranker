import { Bank, Mountains, Sun, Waves } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import type { ComponentType } from 'react';
import { ACTIVITY_PALETTE, type ActivityKind } from '../../../lib/palette.js';

interface ActivityExplainer {
  activity: ActivityKind;
  Icon: ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'duotone' }>;
  label: string;
  what: string;
  factors: readonly string[];
}

const ACTIVITIES: readonly ActivityExplainer[] = [
  {
    activity: 'SKIING',
    Icon: Mountains,
    label: 'Skiing',
    what: 'Fresh powder + cold, calm days.',
    factors: ['fresh snow (40%)', 'cold enough (30%)', 'low wind (20%)', 'clear visibility (10%)'],
  },
  {
    activity: 'SURFING',
    Icon: Waves,
    label: 'Surfing',
    what: 'Clean groundswell at a coastal spot.',
    factors: ['swell height (35%)', 'clean swell (30%)', 'light wind (25%)', 'warm enough (10%)'],
  },
  {
    activity: 'OUTDOOR_SIGHTSEEING',
    Icon: Sun,
    label: 'Outdoor sightseeing',
    what: 'Comfortable, dry, sunny — clean air a bonus.',
    factors: [
      'comfort temp (30%)',
      'no rain (30%)',
      'sunshine (20%)',
      'moderate UV (10%)',
      'clean air (10%)',
    ],
  },
  {
    activity: 'INDOOR_SIGHTSEEING',
    Icon: Bank,
    label: 'Indoor sightseeing',
    what: 'The bad-weather insurance policy.',
    factors: ['rainy (40%)', 'cold or hot outside (30%)', 'overcast (20%)', 'windy (10%)'],
  },
];

/**
 * Landing "How it works" — the four scorers explained. Each card lists the
 * factors + weights so the reader can see how the 0..100 number is built.
 * Static (no cycling); the shader background handles the visual motion.
 */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="w-full">
      <h2 id="how-it-works" className="text-sm uppercase tracking-widest text-neutral-500">
        How it works
      </h2>
      <p className="mt-2 text-neutral-700">
        Each activity has its own weighted formula. Values come from Open-Meteo (weather + marine +
        air quality); a bell curve or ramp maps each factor to{' '}
        <span className="font-mono">0..1</span>, then a weighted sum lands the day between{' '}
        <span className="font-mono">0</span> and <span className="font-mono">100</span>.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {ACTIVITIES.map((a) => {
          const palette = ACTIVITY_PALETTE[a.activity];
          return (
            <motion.li
              key={a.activity}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.35, ease: [0.3, 0, 0, 1] }}
              className="rounded-2xl border border-neutral-200 bg-white/85 p-5 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: `color-mix(in oklch, ${palette.primary} 25%, white)` }}
                >
                  <a.Icon size={22} weight="fill" />
                </span>
                <h3 className="font-serif text-xl">{a.label}</h3>
              </div>
              <p className="mt-3 text-sm text-neutral-700">{a.what}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5 text-xs text-neutral-500">
                {a.factors.map((f) => (
                  <li
                    key={f}
                    className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 font-mono"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
