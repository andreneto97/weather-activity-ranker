/**
 * Formatting helpers. Kept small and framework-free so components can import
 * without pulling extra deps.
 */

export type Units = 'metric' | 'imperial';

export function formatTemperature(celsius: number, units: Units): string {
  if (units === 'imperial') {
    const f = celsius * (9 / 5) + 32;
    return `${Math.round(f)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

/**
 * Weekday abbreviation (Mon, Tue, ...) in the given IANA timezone.
 * Falls back to the runtime's local tz if the IANA name is invalid.
 */
export function formatWeekday(isoDate: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(
      new Date(`${isoDate}T12:00:00Z`),
    );
  } catch {
    return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(isoDate));
  }
}

export function formatDayMonth(isoDate: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    }).format(new Date(`${isoDate}T12:00:00Z`));
  } catch {
    return isoDate.slice(5);
  }
}

export function formatPopulation(pop?: number | null): string {
  if (!pop) return '';
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)}M`;
  if (pop >= 1_000) return `${Math.round(pop / 1_000)}k`;
  return String(pop);
}
