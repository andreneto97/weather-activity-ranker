import { useNavigate } from 'react-router';
import { useCityHistory } from '../../ranking/hooks/useCityHistory.js';

/**
 * Only renders when there are recent cities in localStorage. Silent on first
 * visit — no empty state, since "Try one" already covers the cold-start.
 */
export function RecentCities() {
  const { recent, clear } = useCityHistory();
  const navigate = useNavigate();

  if (recent.length === 0) return null;

  return (
    <section aria-labelledby="recent-cities">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="recent-cities" className="text-sm uppercase tracking-widest text-neutral-500">
          Recent
        </h2>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-neutral-500 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-800"
        >
          Clear
        </button>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {recent.map((r) => (
          <li key={r.name}>
            <button
              type="button"
              onClick={() =>
                navigate(`/city/${encodeURIComponent(r.name)}`, { viewTransition: true })
              }
              className="rounded-full border border-neutral-200 bg-white/70 px-3 py-1.5 text-sm backdrop-blur transition-colors hover:border-[var(--activity-primary)] hover:bg-white"
            >
              {r.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
