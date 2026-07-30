import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Logo } from '../../components/Logo.js';
import { SUGGESTED_CITIES } from '../../lib/suggested-cities.js';
import { CommandPalette } from '../ranking/components/CommandPalette.js';
import { SearchForm } from '../ranking/components/SearchForm.js';
import { useActivityPalette } from '../ranking/hooks/useActivityPalette.js';
import { DataStats } from './components/DataStats.js';
import { HowItWorks } from './components/HowItWorks.js';
import { RecentCities } from './components/RecentCities.js';
import { SampleSummary } from './components/SampleSummary.js';

/**
 * Landing / empty state. No shader background here — the page reads as
 * "editorial dashboard" so the shader is reserved for the ranking route
 * where the activity choice justifies it. Palette is pinned to Outdoor for
 * a warm, sunny first impression.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useActivityPalette('OUTDOOR_SIGHTSEEING');

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <nav aria-label="Home" className="mb-14 flex items-center gap-3 text-sm text-neutral-600">
        <Logo size={32} />
        <span className="font-serif text-lg tracking-tight text-neutral-900">
          Weather Activity Ranker
        </span>
      </nav>

      <header>
        {/*
          `viewTransitionName: 'hero-city'` is intentionally shared with the
          ranking page's <h1>. Router v8 unmounts one route before mounting
          the next, so the names never coexist and the browser morphs
          "Where should you go?" into the city title on navigation. If a
          persistent (non-route) component ever adopts the same name, the
          morph target becomes ambiguous — keep this unique across trees.
        */}
        <h1
          className="font-serif text-6xl tracking-tight sm:text-7xl"
          style={{ viewTransitionName: 'hero-city' }}
        >
          Where should you go?
        </h1>
        <p className="mt-5 text-lg text-neutral-700">
          Type a city — get a 7-day desirability score for skiing, surfing, and sightseeing,
          grounded in real weather + marine + air-quality data.
        </p>
      </header>

      <div className="mt-10">
        <SearchForm autoFocus onOpenPalette={() => setPaletteOpen(true)} />
      </div>

      <div className="mt-8">
        <RecentCities />
      </div>

      <section className="mt-10" aria-label="Suggested cities">
        <h2 className="text-sm uppercase tracking-widest text-neutral-500">Try one</h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          {SUGGESTED_CITIES.map((city) => (
            <li key={city.name}>
              <button
                type="button"
                onClick={() =>
                  navigate(`/city/${encodeURIComponent(city.name)}?activity=${city.activity}`, {
                    viewTransition: true,
                  })
                }
                className="rounded-full border border-neutral-300 bg-white/70 px-4 py-2 text-sm backdrop-blur transition-colors hover:border-[var(--activity-primary)] hover:bg-white"
              >
                <span aria-hidden="true">{city.emoji}</span>{' '}
                <span className="font-medium">{city.name}</span>{' '}
                <span className="text-neutral-500">— {city.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-20">
        <SampleSummary />
      </div>

      <div className="mt-16">
        <HowItWorks />
      </div>

      <div className="mt-16">
        <DataStats />
      </div>

      <footer className="mt-20 flex flex-wrap items-baseline justify-between gap-2 text-xs text-neutral-500">
        <p className="flex items-center gap-2">
          <Logo size={16} />
          <span>
            Weather data by{' '}
            <a
              className="underline"
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Open-Meteo
            </a>{' '}
            · CC-BY 4.0
          </span>
        </p>
        <p>Optional AI summaries via Claude Haiku · template fallback ships by default</p>
      </footer>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </main>
  );
}
