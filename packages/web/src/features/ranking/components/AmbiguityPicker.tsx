import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { type FragmentType, getFragmentData } from '../../../gql/index.js';
import { formatPopulation } from '../../../lib/format.js';
import { LocationFieldsFragment } from '../queries.js';

interface AmbiguityPickerProps {
  candidates: readonly FragmentType<typeof LocationFieldsFragment>[];
  query: string;
}

/**
 * Rendered when the backend returns `AmbiguousLocationError`. Keyboard-navigable:
 * ArrowUp/ArrowDown moves the highlighted row, Enter selects it, click also works.
 *
 * Keydown listener is scoped to the section (not `window`) so opening ⌘K or
 * any other overlay doesn't steal or clash with arrow-key handling. On mount
 * we autofocus the section (`tabIndex=-1`) so keyboard users don't need to
 * click first for the shortcuts to work.
 */
export function AmbiguityPicker({ candidates, query }: AmbiguityPickerProps) {
  const locations = getFragmentData(LocationFieldsFragment, candidates);
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    sectionRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onKeyDown(ev: ReactKeyboardEvent<HTMLElement>) {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActive((i) => Math.min(locations.length - 1, i + 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (ev.key === 'Enter') {
      const selected = locations[active];
      if (selected) {
        navigate(
          `/city/${encodeURIComponent(selected.name)}?locationId=${encodeURIComponent(selected.id)}`,
          { viewTransition: true },
        );
      }
    }
  }

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      aria-labelledby="ambig-title"
      className="mx-auto mt-8 max-w-2xl focus:outline-none"
    >
      <h2 id="ambig-title" className="text-2xl font-serif tracking-tight">
        Did you mean…
      </h2>
      <p className="mt-1 text-sm text-neutral-600">Multiple places match “{query}”. Pick one:</p>
      <ul
        ref={listRef}
        className="mt-4 divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white/70 backdrop-blur"
      >
        {locations.map((loc, i) => (
          <li key={loc.id}>
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/city/${encodeURIComponent(loc.name)}?locationId=${encodeURIComponent(loc.id)}`,
                  { viewTransition: true },
                )
              }
              onMouseEnter={() => setActive(i)}
              aria-current={i === active ? 'true' : undefined}
              className={`flex w-full items-baseline justify-between px-5 py-3 text-left transition-colors ${
                i === active
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
                  pop {formatPopulation(loc.population)}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-500">
        Use <kbd className="font-mono">↑</kbd>/<kbd className="font-mono">↓</kbd> to move,{' '}
        <kbd className="font-mono">Enter</kbd> to select.
      </p>
    </section>
  );
}
