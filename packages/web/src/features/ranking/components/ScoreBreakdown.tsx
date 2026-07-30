interface ScoreComponent {
  readonly label: string;
  readonly value: number;
  readonly weight: number;
}

interface ScoreBreakdownProps {
  components: readonly ScoreComponent[];
}

/**
 * Horizontal bars for each contributing factor. Sorted by weight
 * (heaviest first) since the domain already sorts them that way — do not
 * re-sort here.
 */
export function ScoreBreakdown({ components }: ScoreBreakdownProps) {
  if (components.length === 0) {
    return <p className="text-sm text-neutral-500">No breakdown available.</p>;
  }
  return (
    <ul className="space-y-3">
      {components.map((c) => (
        <li key={c.label}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{c.label}</span>
            <span className="font-mono text-xs tabular-nums text-neutral-500">
              {Math.round(c.value * 100)} · w {c.weight.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/60">
            <div
              className="h-full rounded-full bg-[var(--activity-primary)] transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, c.value * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
