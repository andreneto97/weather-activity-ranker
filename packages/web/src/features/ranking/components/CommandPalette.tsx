import { useQuery } from '@apollo/client';
import { Command } from 'cmdk';
import { useDeferredValue, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { getFragmentData } from '../../../gql/index.js';
import { SUGGESTED_CITIES } from '../../../lib/suggested-cities.js';
import { useCityHistory } from '../hooks/useCityHistory.js';
import { GeocodeQuery, LocationFieldsFragment } from '../queries.js';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ⌘K palette. Groups:
 *   - "Recent" (localStorage from useCityHistory)
 *   - "Popular" (curated SUGGESTED_CITIES)
 *   - "Search" (live geocode results, debounced via useDeferredValue)
 *
 * Uses `cmdk` for keyboard navigation, focus trap, and fuzzy filtering. We
 * skip cmdk's built-in filter for the search group because the server already
 * does that.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const navigate = useNavigate();
  const { recent } = useCityHistory();

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        onOpenChange(!open);
      } else if (ev.key === 'Escape' && open) {
        onOpenChange(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const shouldSearch = deferredQuery.trim().length >= 2;
  const { data } = useQuery(GeocodeQuery, {
    variables: { query: deferredQuery.trim(), limit: 8 },
    skip: !shouldSearch,
  });
  const searchResults = data?.geocode ? getFragmentData(LocationFieldsFragment, data.geocode) : [];

  function goTo(name: string, locationId?: string) {
    const q = locationId
      ? `/city/${encodeURIComponent(name)}?locationId=${encodeURIComponent(locationId)}`
      : `/city/${encodeURIComponent(name)}`;
    navigate(q, { viewTransition: true });
    onOpenChange(false);
    setQuery('');
  }

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: <dialog> + showModal() would fight cmdk's own focus management; role="dialog" gives us the correct AT semantics without the DOM API collision.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search cities"
      className="fixed inset-0 z-50 flex items-start justify-center bg-neutral-950/40 backdrop-blur-sm p-6 pt-24"
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onOpenChange(false);
      }}
    >
      <Command
        label="City search"
        shouldFilter={false}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl"
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search a city…"
          autoFocus
          className="w-full border-b border-neutral-200 px-5 py-4 text-lg outline-none placeholder:text-neutral-400"
        />
        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="p-4 text-sm text-neutral-500">
            {shouldSearch ? 'No matches.' : 'Type at least 2 characters to search.'}
          </Command.Empty>

          {!shouldSearch && recent.length > 0 ? (
            <Command.Group
              heading="Recent"
              className="text-xs uppercase tracking-widest text-neutral-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2"
            >
              {recent.map((r) => (
                <Command.Item
                  key={r.name}
                  value={`recent-${r.name}`}
                  onSelect={() => goTo(r.name)}
                  className="cursor-pointer rounded-lg px-3 py-2 text-base text-neutral-800 aria-selected:bg-[color-mix(in_oklch,var(--activity-primary)_18%,white)]"
                >
                  {r.name}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {!shouldSearch ? (
            <Command.Group
              heading="Popular"
              className="text-xs uppercase tracking-widest text-neutral-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2"
            >
              {SUGGESTED_CITIES.map((c) => (
                <Command.Item
                  key={`popular-${c.name}`}
                  value={`popular-${c.name}`}
                  onSelect={() => goTo(c.name)}
                  className="cursor-pointer rounded-lg px-3 py-2 text-base text-neutral-800 aria-selected:bg-[color-mix(in_oklch,var(--activity-primary)_18%,white)]"
                >
                  <span aria-hidden="true" className="mr-2">
                    {c.emoji}
                  </span>
                  {c.name} <span className="ml-2 text-neutral-500 text-sm">{c.hint}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          {shouldSearch ? (
            <Command.Group
              heading="Results"
              className="text-xs uppercase tracking-widest text-neutral-500 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2"
            >
              {searchResults.map((loc) => (
                <Command.Item
                  key={loc.id}
                  value={`${loc.id}-${loc.name}`}
                  onSelect={() => goTo(loc.name, loc.id)}
                  className="cursor-pointer rounded-lg px-3 py-2 text-base text-neutral-800 aria-selected:bg-[color-mix(in_oklch,var(--activity-primary)_18%,white)]"
                >
                  <span className="font-medium">{loc.name}</span>
                  {loc.admin1 ? <span className="text-neutral-500">, {loc.admin1}</span> : null}
                  <span className="text-neutral-500"> · {loc.country}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>
        <div className="border-t border-neutral-200 px-4 py-2 text-xs text-neutral-500">
          <kbd className="font-mono">↑</kbd>/<kbd className="font-mono">↓</kbd> navigate ·{' '}
          <kbd className="font-mono">↵</kbd> select · <kbd className="font-mono">Esc</kbd> close
        </div>
      </Command>
    </div>
  );
}
