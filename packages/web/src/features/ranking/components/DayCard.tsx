import { Icon } from '@iconify/react';
import { motion } from 'motion/react';
import { type FragmentType, getFragmentData } from '../../../gql/index.js';
import { formatDayMonth, formatTemperature, formatWeekday } from '../../../lib/format.js';
import { meteoconFor, weatherLabel } from '../../../lib/weather-icon.js';
import { useSettings } from '../hooks/useSettings.js';
import { DailyScoreFieldsFragment, ScoreFieldsFragment } from '../queries.js';

interface DayCardProps {
  day: FragmentType<typeof DailyScoreFieldsFragment>;
  timezone: string;
  isBest: boolean;
  isSelected: boolean;
  onSelect: (date: string) => void;
}

/**
 * One day within `ForecastStrip`. The `layoutId` shared element enables the
 * DayCard → DayDetail expansion (step 17). Best-day glow uses `box-shadow`
 * with `color-mix(in oklch, var(--activity-primary) 40%, transparent)`.
 */
export function DayCard({ day, timezone, isBest, isSelected, onSelect }: DayCardProps) {
  const d = getFragmentData(DailyScoreFieldsFragment, day);
  const score = getFragmentData(ScoreFieldsFragment, d.score);
  const value = Math.round(score.value);
  const { units } = useSettings();
  const weather = d.weather;

  return (
    <motion.button
      type="button"
      layoutId={`day-${d.date}`}
      onClick={() => onSelect(d.date)}
      aria-pressed={isSelected}
      aria-label={`${formatWeekday(d.date, timezone)} ${formatDayMonth(d.date, timezone)}: score ${value}${weather ? `, ${weatherLabel(weather.weatherCode)}` : ''}`}
      className={`group relative flex min-h-[132px] flex-col items-start rounded-2xl border p-3 text-left transition-transform hover:-translate-y-1 ${
        isSelected
          ? 'border-[var(--activity-primary)] bg-white shadow-lg'
          : 'border-neutral-200 bg-white shadow-sm hover:shadow-md'
      }`}
      {...(isBest
        ? {
            style: {
              boxShadow: '0 0 40px color-mix(in oklch, var(--activity-primary) 40%, transparent)',
            },
          }
        : {})}
    >
      {isBest ? (
        // Dark chip + white text = 21:1 contrast (WCAG AA on any palette).
        // The activity color would give ~2.7:1 (fails AA); the dot preserves
        // the palette tie-in visually while the text stays readable.
        <span className="absolute -top-2 right-3 flex items-center gap-1.5 rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white shadow-sm">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--activity-primary)]" />
          Best
        </span>
      ) : null}
      <div className="flex w-full items-start justify-between">
        <div>
          <span className="block text-xs uppercase tracking-widest text-neutral-500">
            {formatWeekday(d.date, timezone)}
          </span>
          <span className="text-sm text-neutral-800">{formatDayMonth(d.date, timezone)}</span>
        </div>
        {weather ? (
          // Meteocons are pastel-by-design and only look "right" on a solid
          // white surface — hence the card lost its glass transparency above.
          // The subtle saturation bump keeps them vivid at 48px.
          <Icon
            aria-hidden="true"
            icon={meteoconFor(weather.weatherCode)}
            width={48}
            height={48}
            style={{ filter: 'saturate(1.15)' }}
          />
        ) : null}
      </div>
      <span className="mt-2 font-serif text-4xl tabular-nums">{value}</span>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-neutral-200/70">
        <div
          className="h-full rounded-full bg-[var(--activity-primary)] transition-[width] duration-500 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
      {weather ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
          <span className="font-mono tabular-nums">
            {formatTemperature(weather.tempMinC, units)} ·{' '}
            {formatTemperature(weather.tempMaxC, units)}
          </span>
        </div>
      ) : null}
    </motion.button>
  );
}
