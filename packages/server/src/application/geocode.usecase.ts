import type { Location } from '../domain/location.js';
import type { GeocodingPort } from '../ports/geocoding.port.js';

/**
 * Trivial pass-through use case for the frontend command palette (⌘K typeahead).
 *
 * Exists as a use case (rather than the resolver calling GeocodingPort directly)
 * to keep the layering uniform and to be the natural home for future concerns
 * like search-history persistence or query normalization.
 *
 * See specs/08-use-case.spec.md §GeocodeUseCase.
 */
export interface GeocodeUseCase {
  execute(query: string, limit?: number): Promise<readonly Location[]>;
}

export interface GeocodeUseCaseDeps {
  readonly geocoding: GeocodingPort;
}

export const makeGeocodeUseCase = (deps: GeocodeUseCaseDeps): GeocodeUseCase => ({
  async execute(query, limit) {
    return deps.geocoding.search(query, limit !== undefined ? { limit } : undefined);
  },
});
