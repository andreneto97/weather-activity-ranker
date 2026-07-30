import { LRUCache } from 'lru-cache';
import type { AirQualityDaily, DailyWeather, MarineDaily } from '../../../domain/daily-weather.js';
import type { Location } from '../../../domain/location.js';
import type { AirQualityPort } from '../../../ports/air-quality.port.js';
import type { GeocodingPort } from '../../../ports/geocoding.port.js';
import type { MarinePort } from '../../../ports/marine.port.js';
import type { WeatherPort } from '../../../ports/weather.port.js';

/**
 * Decorator layer: wraps outbound ports with an in-memory LRU cache.
 * Composed in composition-root.ts — adapters stay caching-agnostic.
 *
 * Key design:
 *   - Every key is prefixed with CACHE_SCHEMA_VERSION so a deploy that changes
 *     the response shape or requested variable set invalidates old entries.
 *   - Coordinates rounded to 3 decimals (~100 m) so slightly-different
 *     lat/lon requests for the same practical location share the cache.
 *   - Timezone included: two locations at similar coords but different tz
 *     would collide on `date` fields (00:00 in the response differs).
 *   - Geocoding queries normalized: trim + lowercase + collapse whitespace.
 *
 * TTL guidance (defaults in spec 00 env registry, config-driven at composition):
 *   weather / marine / AQI: 30 min · geocoding: 24 h.
 *
 * See specs/03-open-meteo-adapters.spec.md §Cache decorator.
 */

export const CACHE_SCHEMA_VERSION = 'v1';

export interface CacheOptions {
  readonly ttlMs: number;
  /** Max entries kept in memory. Older entries are LRU-evicted. */
  readonly max: number;
}

// ---------- Weather ----------

export function withWeatherCache(inner: WeatherPort, opts: CacheOptions): WeatherPort {
  const cache = new LRUCache<string, readonly DailyWeather[]>({ max: opts.max, ttl: opts.ttlMs });
  return {
    async getDailyForecast(loc, days) {
      const key = weatherCacheKey(loc, days);
      const hit = cache.get(key);
      if (hit) return hit;
      const fresh = await inner.getDailyForecast(loc, days);
      cache.set(key, fresh);
      return fresh;
    },
  };
}

// ---------- Marine ----------

export function withMarineCache(inner: MarinePort, opts: CacheOptions): MarinePort {
  const cache = new LRUCache<string, readonly MarineDaily[]>({ max: opts.max, ttl: opts.ttlMs });
  return {
    async getDailyMarine(loc, days) {
      const key = marineCacheKey(loc, days);
      const hit = cache.get(key);
      if (hit) return hit;
      const fresh = await inner.getDailyMarine(loc, days);
      cache.set(key, fresh);
      return fresh;
    },
  };
}

// ---------- Air Quality ----------

export function withAirQualityCache(inner: AirQualityPort, opts: CacheOptions): AirQualityPort {
  const cache = new LRUCache<string, readonly AirQualityDaily[]>({
    max: opts.max,
    ttl: opts.ttlMs,
  });
  return {
    async getDailyAirQuality(loc, days) {
      const key = aqiCacheKey(loc, days);
      const hit = cache.get(key);
      if (hit) return hit;
      const fresh = await inner.getDailyAirQuality(loc, days);
      cache.set(key, fresh);
      return fresh;
    },
  };
}

// ---------- Geocoding ----------

export function withGeocodingCache(inner: GeocodingPort, opts: CacheOptions): GeocodingPort {
  const searchCache = new LRUCache<string, readonly Location[]>({
    max: opts.max,
    ttl: opts.ttlMs,
  });
  const idCache = new LRUCache<string, Location>({ max: opts.max, ttl: opts.ttlMs });

  return {
    async search(query, searchOpts) {
      const key = geocodeSearchKey(query, searchOpts?.limit);
      const hit = searchCache.get(key);
      if (hit) return hit;
      const fresh = await inner.search(query, searchOpts);
      searchCache.set(key, fresh);
      // Piggy-back: index each result by id so a subsequent getById hits cache too.
      for (const loc of fresh) idCache.set(geocodeIdKey(loc.id), loc);
      return fresh;
    },
    async getById(id) {
      const key = geocodeIdKey(id);
      const hit = idCache.get(key);
      if (hit) return hit;
      const fresh = await inner.getById(id);
      if (fresh) idCache.set(key, fresh);
      return fresh;
    },
  };
}

// ---------- Key strategies (exported for tests) ----------

const roundCoord = (n: number): string => n.toFixed(3);

export const weatherCacheKey = (loc: Location, days: number): string =>
  `${CACHE_SCHEMA_VERSION}:weather:${roundCoord(loc.latitude)}:${roundCoord(loc.longitude)}:${loc.timezone}:${days}`;

export const marineCacheKey = (loc: Location, days: number): string =>
  `${CACHE_SCHEMA_VERSION}:marine:${roundCoord(loc.latitude)}:${roundCoord(loc.longitude)}:${loc.timezone}:${days}`;

export const aqiCacheKey = (loc: Location, days: number): string =>
  `${CACHE_SCHEMA_VERSION}:aqi:${roundCoord(loc.latitude)}:${roundCoord(loc.longitude)}:${loc.timezone}:${days}`;

export const geocodeSearchKey = (query: string, limit?: number): string =>
  `${CACHE_SCHEMA_VERSION}:geocode:search:${normalizeQuery(query)}:${limit ?? 'default'}`;

export const geocodeIdKey = (id: string): string => `${CACHE_SCHEMA_VERSION}:geocode:id:${id}`;

const normalizeQuery = (q: string): string => q.trim().toLowerCase().replace(/\s+/g, ' ');
