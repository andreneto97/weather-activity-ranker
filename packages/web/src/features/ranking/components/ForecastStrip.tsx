import { AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';
import { type FragmentType, getFragmentData } from '../../../gql/index.js';
import { DailyScoreFieldsFragment, ScoreFieldsFragment } from '../queries.js';
import { DayCard } from './DayCard.js';
import { DayDetail } from './DayDetail.js';
import { NotApplicableCard } from './NotApplicableCard.js';
import { ScoreBreakdown } from './ScoreBreakdown.js';

interface ForecastStripProps {
  days: readonly FragmentType<typeof DailyScoreFieldsFragment>[];
  bestDayDate: string;
  selectedDate: string;
  timezone: string;
  onSelectDay: (date: string) => void;
}

export function ForecastStrip({
  days,
  bestDayDate,
  selectedDate,
  timezone,
  onSelectDay,
}: ForecastStripProps) {
  const unmasked = getFragmentData(DailyScoreFieldsFragment, days);
  const selectedDay = unmasked.find((d) => d.date === selectedDate) ?? unmasked[0];
  const selectedScore = selectedDay
    ? getFragmentData(ScoreFieldsFragment, selectedDay.score)
    : undefined;

  // Which day is expanded into the overlay. Distinct from `selectedDate` so we can
  // keep the breakdown pinned even when the overlay closes.
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const expandedIndex = unmasked.findIndex((d) => d.date === expandedDate);
  const expandedMasked = expandedIndex >= 0 ? days[expandedIndex] : undefined;

  useEffect(() => {
    if (!expandedDate) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setExpandedDate(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedDate]);

  function handleSelect(date: string) {
    onSelectDay(date);
    setExpandedDate(date);
  }

  return (
    <section aria-label="7-day forecast" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((maskedDay, i) => {
          const day = unmasked[i];
          if (!day) return null;
          const score = getFragmentData(ScoreFieldsFragment, day.score);
          if (score.notApplicable) {
            return (
              <div key={day.date} className="min-h-[132px]">
                <NotApplicableCard
                  {...(score.notApplicableReason ? { reason: score.notApplicableReason } : {})}
                />
              </div>
            );
          }
          // Hide the source card while its detail overlay is open, so the layoutId
          // FLIP only has one target on screen (avoids Motion warning + double render).
          if (day.date === expandedDate) {
            return <div key={day.date} className="min-h-[132px]" aria-hidden="true" />;
          }
          return (
            <DayCard
              key={day.date}
              day={maskedDay}
              timezone={timezone}
              isBest={day.date === bestDayDate}
              isSelected={day.date === selectedDate}
              onSelect={handleSelect}
            />
          );
        })}
      </div>

      {selectedDay && selectedScore ? (
        <div
          id={`panel-day-${selectedDay.date}`}
          className="rounded-2xl border border-neutral-200 bg-white/70 p-6 backdrop-blur"
        >
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="font-serif text-2xl">Why {Math.round(selectedScore.value)}?</h3>
            <span className="text-xs uppercase tracking-widest text-neutral-500">Breakdown</span>
          </div>
          <ScoreBreakdown components={selectedScore.components} />
        </div>
      ) : null}

      <AnimatePresence>
        {expandedMasked ? (
          <DayDetail
            day={expandedMasked}
            timezone={timezone}
            onClose={() => setExpandedDate(null)}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
