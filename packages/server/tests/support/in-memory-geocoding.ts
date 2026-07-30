import type { Location } from '../../src/domain/location.js';
import type { GeocodingPort } from '../../src/ports/geocoding.port.js';

/**
 * In-memory GeocodingPort. Feed it a Map of query → candidates and it just
 * looks up. Case-insensitive match on the query, exact match on ID.
 *
 * Used by application tests and integration tests that don't need to exercise
 * the real Open-Meteo adapter.
 */
export class InMemoryGeocoding implements GeocodingPort {
  constructor(
    private readonly searchIndex: Map<string, readonly Location[]> = new Map(),
    private readonly byId: Map<string, Location> = new Map(),
  ) {}

  /** Adds a search entry AND indexes each candidate by ID. */
  addSearch(query: string, results: readonly Location[]): this {
    this.searchIndex.set(normalize(query), results);
    for (const loc of results) this.byId.set(loc.id, loc);
    return this;
  }

  addLocation(loc: Location): this {
    this.byId.set(loc.id, loc);
    return this;
  }

  async search(query: string, opts?: { limit?: number }): Promise<readonly Location[]> {
    const results = this.searchIndex.get(normalize(query)) ?? [];
    return opts?.limit ? results.slice(0, opts.limit) : results;
  }

  async getById(id: string): Promise<Location | null> {
    return this.byId.get(id) ?? null;
  }
}

const normalize = (q: string): string => q.trim().toLowerCase();
