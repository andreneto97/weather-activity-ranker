interface WeekSummaryProps {
  summary: string;
}

/**
 * Editorial one-liner summarizing the week — comes from the backend
 * (either template-generated or Claude Haiku when opt-in is enabled).
 * Frontend does not distinguish the two.
 */
export function WeekSummary({ summary }: WeekSummaryProps) {
  return <p className="font-serif text-2xl italic leading-snug text-neutral-800">“{summary}”</p>;
}
