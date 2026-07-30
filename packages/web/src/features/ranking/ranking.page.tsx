import { Suspense, useEffect, useMemo, useState } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Logo } from '../../components/Logo.js';
import { ActivityShader } from '../../components/background/ActivityShader.js';
import { type FragmentType, getFragmentData } from '../../gql/index.js';
import { assertNever } from '../../lib/assert-never.js';
import type { ActivityKind } from '../../lib/palette.js';
import { ActivitySwitcher } from './components/ActivitySwitcher.js';
import { AmbiguityPicker } from './components/AmbiguityPicker.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ForecastSkeleton } from './components/ForecastSkeleton.js';
import { ForecastStrip } from './components/ForecastStrip.js';
import { ScoreDisplay } from './components/ScoreDisplay.js';
import { WeekSummary } from './components/WeekSummary.js';
import { useActivityPalette } from './hooks/useActivityPalette.js';
import { useCityHistory } from './hooks/useCityHistory.js';
import { useForecast } from './hooks/useForecast.js';
import {
  ActivityRankingFieldsFragment,
  DailyScoreFieldsFragment,
  LocationFieldsFragment,
} from './queries.js';

const VALID_ACTIVITIES: readonly ActivityKind[] = [
  'SKIING',
  'SURFING',
  'OUTDOOR_SIGHTSEEING',
  'INDOOR_SIGHTSEEING',
];

function isActivity(x: string | null): x is ActivityKind {
  return x !== null && (VALID_ACTIVITIES as readonly string[]).includes(x);
}

export function RankingPage() {
  // `useParams()` already URL-decodes route segments — a second
  // `decodeURIComponent(name)` throws `URIError` on any legitimate URL whose
  // decoded form contains a stray `%` (e.g. a shared link that got
  // double-encoded), which unwinds to the ErrorBoundary as a generic
  // "Something went wrong" instead of a graceful 404. Router's output is
  // safe to pass through as-is.
  const { name } = useParams<{ name: string }>();
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get('locationId') ?? undefined;
  if (!name) throw new Error('city name missing from route');

  return (
    <ErrorBoundary fallbackRender={PageFailure}>
      <Suspense
        fallback={
          <PageShell cityName={name}>
            <ForecastSkeleton />
          </PageShell>
        }
      >
        <ForecastContent cityQuery={name} {...(locationId ? { locationId } : {})} />
      </Suspense>
    </ErrorBoundary>
  );
}

interface ForecastContentProps {
  cityQuery: string;
  locationId?: string;
}

function ForecastContent({ cityQuery, locationId }: ForecastContentProps) {
  const { data } = useForecast(cityQuery, locationId);
  const result = data.activityRankings;

  switch (result.__typename) {
    case 'ActivityRankings':
      return <RankingView data={result} />;
    case 'AmbiguousLocationError':
      return (
        <PageShell cityName={cityQuery}>
          <AmbiguityPicker candidates={result.candidates} query={cityQuery} />
        </PageShell>
      );
    case 'CityNotFoundError':
      return (
        <PageShell cityName={cityQuery}>
          <EmptyMessage
            title={`Couldn’t find “${result.query}”`}
            body="Try a nearby city, or pick one below."
          />
        </PageShell>
      );
    case 'UpstreamUnavailableError':
      return (
        <PageShell cityName={cityQuery}>
          <EmptyMessage
            title="Weather data is temporarily unavailable"
            body={`The ${result.provider} feed didn’t respond. Give it a moment and try again.`}
          />
        </PageShell>
      );
    default:
      return assertNever(result);
  }
}

interface RankingViewProps {
  data: {
    city: FragmentType<typeof LocationFieldsFragment>;
    summary: string;
    generatedAt: string;
    rankings: readonly FragmentType<typeof ActivityRankingFieldsFragment>[];
  };
}

function RankingView({ data }: RankingViewProps) {
  const city = getFragmentData(LocationFieldsFragment, data.city);
  const rankings = getFragmentData(ActivityRankingFieldsFragment, data.rankings);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { push } = useCityHistory();

  const queryActivity = searchParams.get('activity');
  const availableActivities: ActivityKind[] = rankings.map((r) => r.activity);

  const defaultActivity: ActivityKind =
    isActivity(queryActivity) && availableActivities.includes(queryActivity)
      ? queryActivity
      : (rankings[0]?.activity ?? 'OUTDOOR_SIGHTSEEING');

  const [selectedActivity, setSelectedActivity] = useState<ActivityKind>(defaultActivity);

  useActivityPalette(selectedActivity);

  useEffect(() => {
    push(city.name);
  }, [city.name, push]);

  const currentRanking = rankings.find((r) => r.activity === selectedActivity) ?? rankings[0];
  const dailyScores = currentRanking?.dailyScores ?? [];
  const bestDay = currentRanking
    ? getFragmentData(DailyScoreFieldsFragment, currentRanking.bestDay)
    : undefined;

  const [selectedDate, setSelectedDate] = useState<string>(bestDay?.date ?? '');
  useEffect(() => {
    // When the user switches activity, jump the day selection back to the best day
    // for the new activity so the breakdown reflects the activity's own peak.
    if (bestDay) setSelectedDate(bestDay.date);
  }, [bestDay]);

  const scoresByActivity = useMemo(() => {
    const map: Partial<Record<ActivityKind, number>> = {};
    for (const r of rankings) {
      map[r.activity] = r.overallScore;
    }
    return map;
  }, [rankings]);

  function handleSelectActivity(next: ActivityKind) {
    setSelectedActivity(next);
    const params = new URLSearchParams(searchParams);
    params.set('activity', next);
    navigate(`?${params.toString()}`, { replace: true });
  }

  return (
    <PageShell
      cityName={city.name}
      subtitle={`${city.admin1 ? `${city.admin1}, ` : ''}${city.country}`}
    >
      <ActivityShader activity={selectedActivity} />
      <div aria-live="polite" className="sr-only">
        Showing 7-day forecast for {city.name}.
      </div>

      <WeekSummary summary={data.summary} />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <ActivitySwitcher
          selected={selectedActivity}
          available={availableActivities}
          scores={scoresByActivity}
          onSelect={handleSelectActivity}
        />
        {currentRanking ? (
          <ScoreDisplay
            value={currentRanking.overallScore}
            size="lg"
            label="Overall (mean of top 3)"
          />
        ) : null}
      </div>

      <div
        id={`panel-${selectedActivity}`}
        role="tabpanel"
        aria-labelledby={`tab-${selectedActivity}`}
        className="mt-8"
      >
        {currentRanking ? (
          <ForecastStrip
            days={dailyScores}
            bestDayDate={bestDay?.date ?? ''}
            selectedDate={selectedDate}
            timezone={city.timezone}
            onSelectDay={setSelectedDate}
          />
        ) : (
          <EmptyMessage
            title="No data for this activity"
            body="Try a different activity or city."
          />
        )}
      </div>

      <p className="mt-12 text-xs text-neutral-500">
        Generated {new Date(data.generatedAt).toLocaleString()} · Weather data by{' '}
        <a
          className="underline"
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer noopener"
        >
          Open-Meteo
        </a>{' '}
        · CC-BY 4.0
      </p>
    </PageShell>
  );
}

function PageShell({
  cityName,
  subtitle,
  children,
}: {
  cityName: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <Logo size={24} />
          <span>← Home</span>
        </Link>
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white/60 px-3 py-1.5 text-xs text-neutral-600 backdrop-blur hover:bg-white"
        >
          Search another city
          <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 font-mono">
            ⌘K
          </kbd>
        </button>
      </div>
      <header className="mb-6">
        <h1
          className="font-serif text-6xl tracking-tight"
          style={{ viewTransitionName: 'hero-city' }}
        >
          {cityName}
        </h1>
        {subtitle ? <p className="mt-2 text-neutral-600">{subtitle}</p> : null}
      </header>
      {children}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </main>
  );
}

function EmptyMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white/70 p-8 text-center backdrop-blur">
      <h2 className="font-serif text-3xl">{title}</h2>
      <p className="mt-2 text-neutral-600">{body}</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-full border border-neutral-300 bg-white/60 px-4 py-2 text-sm hover:bg-white"
      >
        Back to home
      </Link>
    </div>
  );
}

function PageFailure({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-4xl">Something went wrong</h1>
      <p className="mt-4 text-neutral-700">{message}</p>
      <button
        type="button"
        onClick={resetErrorBoundary}
        className="mt-6 rounded-full border border-neutral-300 bg-white/60 px-4 py-2 text-sm hover:bg-white"
      >
        Try again
      </button>
    </main>
  );
}
