interface Stat {
  value: string;
  label: string;
  hint?: string;
}

const STATS: readonly Stat[] = [
  { value: '4', label: 'activities scored', hint: 'ski · surf · outdoor · indoor' },
  { value: '3', label: 'weather feeds', hint: 'forecast · marine · air quality' },
  { value: '7', label: 'day forecasts', hint: 'per activity, per city' },
  { value: '30m', label: 'cache TTL', hint: 'cities pre-warmed on boot' },
];

/**
 * Landing footer strip — light numeric texture so the page has more density
 * without shouting. Reads as "there's real engineering behind this" without
 * needing a full architecture pitch on the marketing surface.
 */
export function DataStats() {
  return (
    <section aria-labelledby="data-stats" className="w-full">
      <h2 id="data-stats" className="sr-only">
        By the numbers
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-neutral-200 bg-white/70 p-4 backdrop-blur"
          >
            <dt className="text-xs uppercase tracking-widest text-neutral-500">{s.label}</dt>
            <dd className="mt-1">
              <span className="block font-serif text-4xl tabular-nums">{s.value}</span>
              {s.hint ? (
                <span className="mt-1 block text-xs text-neutral-500">{s.hint}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
