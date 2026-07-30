import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  makeAirQualityWeek,
  makeLocation,
  makeMarineWeek,
  makeWeek,
} from '../../../../tests/support/factories.js';
import { InMemoryGeocoding } from '../../../../tests/support/in-memory-geocoding.js';
import { StubAirQuality } from '../../../../tests/support/stub-air-quality.js';
import { StubMarine } from '../../../../tests/support/stub-marine.js';
import { StubWeather } from '../../../../tests/support/stub-weather.js';
import { NotApplicableError } from '../../../domain/errors.js';
import {
  CACHE_SCHEMA_VERSION,
  aqiCacheKey,
  geocodeIdKey,
  geocodeSearchKey,
  marineCacheKey,
  weatherCacheKey,
  withAirQualityCache,
  withGeocodingCache,
  withMarineCache,
  withWeatherCache,
} from './lru-cached.js';

const OPTS = { ttlMs: 60_000, max: 100 };
const lisbon = makeLocation();

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse('2026-07-28T12:00:00Z') });
});
afterEach(() => {
  jest.useRealTimers();
});

// ============================================================================
// Key strategies
// ============================================================================

describe('cache key strategies', () => {
  it('prefixes every key with the current schema version', () => {
    expect(weatherCacheKey(lisbon, 7).startsWith(`${CACHE_SCHEMA_VERSION}:`)).toBe(true);
    expect(marineCacheKey(lisbon, 7).startsWith(`${CACHE_SCHEMA_VERSION}:`)).toBe(true);
    expect(aqiCacheKey(lisbon, 7).startsWith(`${CACHE_SCHEMA_VERSION}:`)).toBe(true);
    expect(geocodeSearchKey('lisbon').startsWith(`${CACHE_SCHEMA_VERSION}:`)).toBe(true);
    expect(geocodeIdKey('42').startsWith(`${CACHE_SCHEMA_VERSION}:`)).toBe(true);
  });

  it('rounds coordinates to 3 decimals so nearby points share the cache', () => {
    const a = makeLocation({ id: 'a', latitude: 38.7167, longitude: -9.1333 });
    const b = makeLocation({ id: 'b', latitude: 38.71671, longitude: -9.13334 });
    expect(weatherCacheKey(a, 7)).toBe(weatherCacheKey(b, 7));
  });

  it('includes timezone (two nearby locations in different tz get distinct keys)', () => {
    const west = makeLocation({ id: 'a', timezone: 'Europe/Lisbon' });
    const east = makeLocation({ id: 'b', timezone: 'Europe/Madrid' });
    expect(weatherCacheKey(west, 7)).not.toBe(weatherCacheKey(east, 7));
  });

  it('normalizes geocoding query (trim + lowercase + collapse whitespace)', () => {
    expect(geocodeSearchKey('  Lisbon  ')).toBe(geocodeSearchKey('lisbon'));
    expect(geocodeSearchKey('rio  de  janeiro')).toBe(geocodeSearchKey('Rio de Janeiro'));
  });

  it('geocoding search: distinct keys for different limits', () => {
    expect(geocodeSearchKey('lisbon', 5)).not.toBe(geocodeSearchKey('lisbon', 10));
  });
});

// ============================================================================
// Weather cache
// ============================================================================

describe('withWeatherCache', () => {
  it('hits cache on repeat call (only 1 upstream fetch)', async () => {
    const inner = new StubWeather().set(lisbon.id, makeWeek());
    const spy = jest.spyOn(inner, 'getDailyForecast');
    const cached = withWeatherCache(inner, OPTS);

    const first = await cached.getDailyForecast(lisbon, 7);
    const second = await cached.getDailyForecast(lisbon, 7);
    expect(first).toBe(second); // same reference
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('evicts after TTL expiry (re-fetches)', async () => {
    // lru-cache uses perf_hooks internally, which jest fake timers don't reach —
    // use real time with a tiny TTL instead.
    jest.useRealTimers();
    const inner = new StubWeather().set(lisbon.id, makeWeek());
    const spy = jest.spyOn(inner, 'getDailyForecast');
    const cached = withWeatherCache(inner, { ttlMs: 20, max: 100 });

    await cached.getDailyForecast(lisbon, 7);
    await new Promise((r) => setTimeout(r, 30));
    await cached.getDailyForecast(lisbon, 7);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('does not cache errors — a failed call still exhausts upstream on retry', async () => {
    const inner = new StubWeather().set(lisbon.id, makeWeek()).throwOn(lisbon.id);
    const spy = jest.spyOn(inner, 'getDailyForecast');
    const cached = withWeatherCache(inner, OPTS);

    await expect(cached.getDailyForecast(lisbon, 7)).rejects.toThrow();
    // Second call succeeds (throwOn consumed) — proves the failed call didn't poison the cache with anything
    const second = await cached.getDailyForecast(lisbon, 7);
    expect(second).toHaveLength(7);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('distinguishes cache by `days` argument', async () => {
    const inner = new StubWeather().set(lisbon.id, makeWeek());
    const spy = jest.spyOn(inner, 'getDailyForecast');
    const cached = withWeatherCache(inner, OPTS);
    await cached.getDailyForecast(lisbon, 7);
    await cached.getDailyForecast(lisbon, 3);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// Marine cache
// ============================================================================

describe('withMarineCache', () => {
  it('caches successful marine data', async () => {
    const rio = makeLocation({ id: 'rio' });
    const inner = new StubMarine().set(rio.id, makeMarineWeek());
    const spy = jest.spyOn(inner, 'getDailyMarine');
    const cached = withMarineCache(inner, OPTS);

    await cached.getDailyMarine(rio, 7);
    await cached.getDailyMarine(rio, 7);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not cache NotApplicableError (each inland call re-invokes upstream — cheap failure)', async () => {
    const chamonix = makeLocation({ id: 'chamonix' });
    const inner = new StubMarine(); // no set → NotApplicable
    const spy = jest.spyOn(inner, 'getDailyMarine');
    const cached = withMarineCache(inner, OPTS);

    await expect(cached.getDailyMarine(chamonix, 7)).rejects.toThrow(NotApplicableError);
    await expect(cached.getDailyMarine(chamonix, 7)).rejects.toThrow(NotApplicableError);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// Air Quality cache
// ============================================================================

describe('withAirQualityCache', () => {
  it('caches successful AQI data', async () => {
    const inner = new StubAirQuality().set(lisbon.id, makeAirQualityWeek());
    const spy = jest.spyOn(inner, 'getDailyAirQuality');
    const cached = withAirQualityCache(inner, OPTS);

    await cached.getDailyAirQuality(lisbon, 7);
    await cached.getDailyAirQuality(lisbon, 7);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Geocoding cache
// ============================================================================

describe('withGeocodingCache', () => {
  it('caches search results and normalizes query', async () => {
    const inner = new InMemoryGeocoding().addSearch('lisbon', [lisbon]);
    const spy = jest.spyOn(inner, 'search');
    const cached = withGeocodingCache(inner, OPTS);

    await cached.search('lisbon');
    await cached.search('  LISBON  ');
    expect(spy).toHaveBeenCalledTimes(1); // second call served from cache
  });

  it('search populates the by-id cache (getById after search is free)', async () => {
    const inner = new InMemoryGeocoding().addSearch('lisbon', [lisbon]);
    const searchSpy = jest.spyOn(inner, 'search');
    const idSpy = jest.spyOn(inner, 'getById');
    const cached = withGeocodingCache(inner, OPTS);

    await cached.search('lisbon');
    const byId = await cached.getById(lisbon.id);

    expect(byId).toEqual(lisbon);
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(idSpy).toHaveBeenCalledTimes(0); // getById didn't need to hit upstream
  });

  it('getById returns null cache miss when upstream returns null (does not cache negative)', async () => {
    const inner = new InMemoryGeocoding();
    const spy = jest.spyOn(inner, 'getById');
    const cached = withGeocodingCache(inner, OPTS);

    expect(await cached.getById('ghost')).toBeNull();
    expect(await cached.getById('ghost')).toBeNull();
    // Both calls go through — we intentionally don't cache the null so a
    // later addLocation() would be picked up.
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
