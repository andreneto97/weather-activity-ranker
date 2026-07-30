/**
 * Dimensionally-accurate skeleton so Suspense fallback → real render has
 * zero cumulative layout shift.
 */
export function ForecastSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="h-9 w-72 animate-pulse rounded bg-neutral-200/60" />
      <div className="h-16 w-full max-w-xl animate-pulse rounded bg-neutral-200/60" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder
            key={i}
            className="min-h-[132px] animate-pulse rounded-2xl bg-neutral-200/60"
          />
        ))}
      </div>
      <div className="h-40 w-full animate-pulse rounded-2xl bg-neutral-200/60" />
    </div>
  );
}
