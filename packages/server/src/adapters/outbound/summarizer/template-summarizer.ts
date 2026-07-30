import type { SummarizerInput, SummarizerPort } from '../../../ports/summarizer.port.js';
import { activityLabel } from './activity-label.js';

/**
 * Deterministic template-based week summary. Always safe, never throws.
 * Used both as the primary summarizer (when Claude Haiku is unconfigured)
 * and as the fallback for ClaudeHaikuSummarizer.
 *
 * Output shape (examples):
 *   "Lisbon this week: best for outdoor sightseeing on Wednesday (85).
 *    Skip skiing — not applicable here."
 *   "Rough week in London — nothing scores above 42. Indoor sightseeing
 *    is your best bet (35)."
 *
 * See specs/01-domain-model.spec.md §SummarizerPort.
 */
export class TemplateSummarizer implements SummarizerPort {
  async summarize(input: SummarizerInput): Promise<string> {
    try {
      return render(input);
    } catch {
      // Contract: never throw. Fall back to the simplest possible string.
      return `Weather forecast for ${input.city.name}.`;
    }
  }
}

function render(input: SummarizerInput): string {
  const { city, rankings } = input;
  if (rankings.length === 0) {
    return `Weather forecast for ${city.name}.`;
  }

  const [top, ...rest] = rankings;
  const bottom = rest.at(-1);
  const bestDayName = formatWeekday(top!.bestDay.date, city.timezone);

  // Rough week: even the best activity scores poorly.
  if (top!.overallScore < 30) {
    return `Rough week in ${city.name} — nothing scores above ${top!.overallScore}. ${capitalize(activityLabel(top!.activity))} is your best bet (${top!.overallScore}).`;
  }

  // If the bottom activity is Not Applicable (overallScore === 0), call it out.
  if (bottom && bottom.overallScore === 0) {
    return `${city.name} this week: best for ${activityLabel(top!.activity)} on ${bestDayName} (${top!.overallScore}). Skip ${activityLabel(bottom.activity)} — not applicable here.`;
  }

  // Normal case: highlight the top, mention overall for context.
  if (bottom) {
    return `${city.name} this week: best for ${activityLabel(top!.activity)} on ${bestDayName} (${top!.overallScore}). ${capitalize(activityLabel(bottom.activity))} scored lowest (${bottom.overallScore}).`;
  }

  return `${city.name} this week: best for ${activityLabel(top!.activity)} on ${bestDayName} (${top!.overallScore}).`;
}

/**
 * Format an ISO date (YYYY-MM-DD) as a weekday name in the city's timezone.
 * Falls back to the raw date on any Intl error.
 */
function formatWeekday(isoDate: string, timezone: string): string {
  try {
    // Anchor at 12:00 UTC so timezone shifts don't push us into the wrong day.
    const asDate = new Date(`${isoDate}T12:00:00Z`);
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone }).format(asDate);
  } catch {
    return isoDate;
  }
}

const capitalize = (s: string): string => (s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1));
