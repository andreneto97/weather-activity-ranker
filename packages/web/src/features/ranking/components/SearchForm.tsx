import { useQuery } from '@apollo/client';
import {
  type FormEvent,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useNavigate } from 'react-router';
import { getFragmentData } from '../../../gql/index.js';
import { formatPopulation } from '../../../lib/format.js';
import { GeocodeQuery, LocationFieldsFragment } from '../queries.js';

interface SearchFormProps {
  initial?: string;
  autoFocus?: boolean;
  /** ⌘K opens the full CommandPalette (Recent + Popular + search). */
  onOpenPalette?: () => void;
}

/**
 * Prominent landing search field with an inline geocode typeahead dropdown
 * anchored below the input (Google-style). `useDeferredValue` throttles the
 * network hit; `errorPolicy: 'ignore'` keeps transient network hiccups from
 * throwing into the page's Suspense/ErrorBoundary while the user is typing.
 *
 * ⌘K still opens the full CommandPalette which layers Recent + Popular on top.
 */
export function SearchForm({ initial = '', autoFocus, onOpenPalette }: SearchFormProps) {
  const [value, setValue] = useState(initial);
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();
  const navigate = useNavigate();

  const deferred = useDeferredValue(value.trim());
  const shouldSearch = deferred.length >= 2;
  const { data, loading, error } = useQuery(GeocodeQuery, {
    variables: { query: deferred, limit: 8 },
    skip: !shouldSearch,
    errorPolicy: 'ignore',
  });
  const results = data?.geocode ? getFragmentData(LocationFieldsFragment, data.geocode) : [];
  const typeaheadFailed = shouldSearch && !!error && !data;
  const dropdownOpen = open && shouldSearch;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `deferred` is intentional — reset the highlighted row every time the debounced query changes, without reading it inside the effect.
  useEffect(() => {
    setActiveIndex(0);
  }, [deferred]);

  useEffect(() => {
    // Close the dropdown when clicking outside the whole field + list.
    function onDocClick(ev: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function goTo(name: string, locationId?: string) {
    startTransition(() => {
      const url = locationId
        ? `/city/${encodeURIComponent(name)}?locationId=${encodeURIComponent(locationId)}`
        : `/city/${encodeURIComponent(name)}`;
      navigate(url, { viewTransition: true });
    });
    setOpen(false);
  }

  function handleSubmit(ev: FormEvent) {
    ev.preventDefault();
    // If the dropdown has a selection, prefer that (locked-in city). Otherwise
    // submit the raw query and let the backend resolve / disambiguate.
    const selected = results[activeIndex];
    if (dropdownOpen && selected) {
      goTo(selected.name, selected.id);
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      inputRef.current?.focus();
      return;
    }
    goTo(trimmed);
  }

  function handleKeyDown(ev: React.KeyboardEvent<HTMLInputElement>) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      onOpenPalette?.();
      return;
    }
    if (!dropdownOpen) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (ev.key === 'Escape') {
      setOpen(false);
      setValue('');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full" role="search">
      <label htmlFor="city-search" className="sr-only">
        City name
      </label>
      <div ref={rootRef} className="relative">
        <input
          id="city-search"
          ref={inputRef}
          type="search"
          // biome-ignore lint/a11y/noAutofocus: search page's sole purpose is entering a city; autofocus is expected UX (like Google's homepage).
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search a city — e.g. Chamonix, Ericeira, Barcelona…"
          aria-invalid={value.length > 0 && value.trim().length < 2}
          aria-describedby="city-search-hint"
          aria-expanded={dropdownOpen}
          aria-controls="city-search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            dropdownOpen && results[activeIndex]
              ? `city-search-opt-${results[activeIndex].id}`
              : undefined
          }
          role="combobox"
          autoComplete="off"
          className="w-full rounded-2xl border border-neutral-300 bg-white/70 px-5 py-4 text-lg backdrop-blur placeholder:text-neutral-400 focus:border-[var(--activity-primary)] focus:outline-none"
          disabled={pending}
        />
        <kbd className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-md border border-neutral-300 bg-white/60 px-2 py-1 font-mono text-xs text-neutral-500">
          ⌘K
        </kbd>

        {dropdownOpen ? (
          <ul
            id="city-search-listbox"
            role="listbox"
            className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-neutral-200 bg-white/95 shadow-xl backdrop-blur"
          >
            {loading && results.length === 0 ? (
              <li className="px-5 py-3 text-sm text-neutral-500">Searching…</li>
            ) : null}
            {typeaheadFailed ? (
              <li className="px-5 py-3 text-sm text-neutral-500">
                Typeahead is unreachable. Press <kbd className="font-mono">Enter</kbd> to search
                anyway — the backend will resolve the city.
              </li>
            ) : null}
            {!loading && !typeaheadFailed && results.length === 0 ? (
              <li className="px-5 py-3 text-sm text-neutral-500">
                No matches. Press Enter to search anyway.
              </li>
            ) : null}
            {results.map((loc, i) => (
              <li
                key={loc.id}
                id={`city-search-opt-${loc.id}`}
                role="option"
                aria-selected={i === activeIndex}
              >
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseDown={(e) => {
                    // Prevent the input from losing focus + closing the list
                    // before the click fires.
                    e.preventDefault();
                  }}
                  onClick={() => goTo(loc.name, loc.id)}
                  className={`flex w-full items-baseline justify-between px-5 py-3 text-left transition-colors ${
                    i === activeIndex
                      ? 'bg-[color-mix(in_oklch,var(--activity-primary)_15%,transparent)]'
                      : ''
                  }`}
                >
                  <span>
                    <span className="font-medium">{loc.name}</span>
                    {loc.admin1 ? <span className="text-neutral-500">, {loc.admin1}</span> : null}
                    <span className="text-neutral-500"> · {loc.country}</span>
                  </span>
                  {loc.population ? (
                    <span className="font-mono text-xs text-neutral-500">
                      {formatPopulation(loc.population)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p id="city-search-hint" className="mt-2 text-xs text-neutral-500">
        <kbd className="font-mono">↑</kbd>/<kbd className="font-mono">↓</kbd> to navigate ·{' '}
        <kbd className="font-mono">Enter</kbd> to select · <kbd className="font-mono">⌘K</kbd> for
        Recent + Popular
      </p>
    </form>
  );
}
