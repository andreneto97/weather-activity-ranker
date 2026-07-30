import { Icon } from '@iconify/react';
import { motion } from 'motion/react';
import { type FragmentType, getFragmentData } from '../../../gql/index.js';
import { formatDayMonth, formatTemperature, formatWeekday } from '../../../lib/format.js';
import { meteoconFor, weatherLabel } from '../../../lib/weather-icon.js';
import { useSettings } from '../hooks/useSettings.js';
import { DailyScoreFieldsFragment, ScoreFieldsFragment } from '../queries.js';
import { ScoreBreakdown } from './ScoreBreakdown.js';

interface DayDetailProps {
  day: FragmentType<typeof DailyScoreFieldsFragment>;
  timezone: string;
  onClose: () => void;
}

/**
 * Full-screen expanded day panel. Shares `layoutId="day-{date}"` with the
 * originating DayCard, so Motion morphs the card into this panel via FLIP.
 * Contains hero Meteocons icon, weather narrative, and full ScoreBreakdown.
 */
export function DayDetail({ day, timezone, onClose }: DayDetailProps) {
  const d = getFragmentData(DailyScoreFieldsFragment, day);
  const score = getFragmentData(ScoreFieldsFragment, d.score);
  const weather = d.weather;
  const { units } = useSettings();

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-neutral-950/40 backdrop-blur-sm p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <motion.div
        layoutId={`day-${d.date}`}
        // biome-ignore lint/a11y/useSemanticElements: layoutId FLIP animation runs on the target motion.div; wrapping in <dialog> + .showModal() would fight Motion's transform-based morph. role="dialog" + aria-modal give the correct AT semantics.
        role="dialog"
        aria-modal="true"
        aria-label={`Details for ${formatWeekday(d.date, timezone)} ${formatDayMonth(d.date, timezone)}`}
        className="relative max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full border border-neutral-200 bg-white/60 px-3 py-1 text-sm text-neutral-600 hover:bg-white"
        >
          Close · Esc
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-neutral-500">
              {formatWeekday(d.date, timezone)}
            </p>
            <h2 className="font-serif text-4xl">{formatDayMonth(d.date, timezone)}</h2>
            {weather ? (
              <p className="mt-2 text-neutral-600">{weatherLabel(weather.weatherCode)}</p>
            ) : null}
          </div>
          {weather ? (
            <Icon
              icon={meteoconFor(weather.weatherCode)}
              width={128}
              height={128}
              aria-hidden="true"
              style={{ filter: 'saturate(1.15)' }}
            />
          ) : null}
        </div>

        {weather ? (
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <MetricCell
              label="Temperature"
              value={`${formatTemperature(weather.tempMinC, units)} · ${formatTemperature(weather.tempMaxC, units)}`}
            />
            <MetricCell label="Rain chance" value={`${weather.precipitationProbabilityMaxPct}%`} />
            <MetricCell label="Max wind" value={`${Math.round(weather.windMaxKmh)} km/h`} />
            <MetricCell label="Cloud cover" value={`${weather.cloudCoverPct}%`} />
          </dl>
        ) : null}

        <div className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-serif text-2xl">Why {Math.round(score.value)}?</h3>
            <span className="text-xs uppercase tracking-widest text-neutral-500">
              Score breakdown
            </span>
          </div>
          <ScoreBreakdown components={score.components} />
        </div>
      </motion.div>
    </motion.div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-neutral-500">{label}</dt>
      <dd className="font-mono text-lg tabular-nums text-neutral-800">{value}</dd>
    </div>
  );
}
