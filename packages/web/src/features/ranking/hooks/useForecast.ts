import { useSuspenseQuery } from '@apollo/client';
import { ActivityRankingsQuery } from '../queries.js';

/**
 * Suspense-first fetch. Throws for HTTP failures (Apollo error → caught by
 * <ErrorBoundary>). Domain errors (CityNotFound, Ambiguous, UpstreamUnavailable)
 * come back as *data* union members and are branched on in the page component.
 *
 * `exactOptionalPropertyTypes` — only include `locationId` when defined.
 */
export function useForecast(cityQuery: string, locationId?: string) {
  const variables = locationId ? { cityQuery, locationId } : { cityQuery };
  return useSuspenseQuery(ActivityRankingsQuery, { variables });
}
