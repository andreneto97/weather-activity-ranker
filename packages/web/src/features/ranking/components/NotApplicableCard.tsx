interface NotApplicableCardProps {
  reason?: string;
}

/**
 * Rendered inline in `ForecastStrip` when a day's score has value 0 and a
 * `not_applicable` reason. Muted, gray palette override, reason label
 * prominent. Not counted in `bestDay` visualization.
 */
export function NotApplicableCard({ reason }: NotApplicableCardProps) {
  return (
    <div
      className="flex h-full flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-100/60 p-4 text-center opacity-70"
      aria-label={`Not applicable${reason ? `: ${reason}` : ''}`}
    >
      <span className="text-xs uppercase tracking-widest text-neutral-500">N/A</span>
      {reason ? <p className="mt-2 text-xs text-neutral-500">{reason}</p> : null}
    </div>
  );
}
