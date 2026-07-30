/**
 * Editorial anchor — an example one-line summary rendered in Instrument Serif
 * italic. This is what the app produces for every city (either the template
 * summarizer or Claude Haiku when opt-in is enabled). Landing shows one so
 * the user knows the vibe before they type.
 */
export function SampleSummary() {
  return (
    <figure className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-6 -top-6 select-none font-serif text-8xl leading-none text-[color-mix(in_oklch,var(--activity-primary)_35%,transparent)]"
      >
        “
      </span>
      <blockquote className="font-serif text-2xl italic leading-snug text-neutral-800 sm:text-3xl">
        Chamonix this week: best for outdoor sightseeing on Sunday{' '}
        <span className="tabular-nums">(78)</span>. Skip surfing — not applicable here.
      </blockquote>
      <figcaption className="mt-3 text-xs uppercase tracking-widest text-neutral-500">
        Sample week summary · every city, every load
      </figcaption>
    </figure>
  );
}
