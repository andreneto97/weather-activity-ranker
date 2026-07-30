import type { Location } from '../domain/location.js';

/**
 * Resolves free-text queries and opaque IDs into Locations.
 * See specs/01-domain-model.spec.md §Ports.
 */
export interface GeocodingPort {
  /**
   * Free-text search. Returns [] when no matches.
   * Throws UpstreamError on network / 5xx failures.
   */
  search(query: string, opts?: { limit?: number }): Promise<readonly Location[]>;

  /**
   * Direct lookup by opaque geocoder ID (returned in previous search results).
   * Used after AmbiguousLocation to skip re-geocoding.
   * Returns null if the ID is unknown.
   */
  getById(id: string): Promise<Location | null>;
}
