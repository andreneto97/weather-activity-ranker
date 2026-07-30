import { describe, expect, it } from '@jest/globals';
import { mockHttp } from '../../../../tests/support/mock-http.js';
import { createHttpClient } from '../../../infrastructure/http.js';
import geocodingEmpty from './__fixtures__/geocoding-empty.json' with { type: 'json' };
import geocodingLisbon from './__fixtures__/geocoding-lisbon.json' with { type: 'json' };
import geocodingSpringfield from './__fixtures__/geocoding-springfield.json' with { type: 'json' };
import { createOpenMeteoGeocodingAdapter } from './geocoding.adapter.js';

const SEARCH_ORIGIN = 'https://geocoding-api.open-meteo.com';
const SEARCH_PATH = /^\/v1\/search/;
const GET_PATH = /^\/v1\/get/;
const http = createHttpClient({ timeoutMs: 500, retries: 0 });
const adapter = createOpenMeteoGeocodingAdapter(http);

describe('OpenMeteoGeocodingAdapter — search', () => {
  it('maps geocoding results to domain Locations', async () => {
    const { pool } = mockHttp(SEARCH_ORIGIN);
    pool.intercept({ path: SEARCH_PATH, method: 'GET' }).reply(200, geocodingLisbon);

    const results = await adapter.search('lisbon');
    expect(results).toHaveLength(1);
    expect(results[0]!).toMatchObject({
      id: '2267057',
      name: 'Lisbon',
      country: 'Portugal',
      timezone: 'Europe/Lisbon',
    });
  });

  it('returns [] when Open-Meteo omits the `results` field', async () => {
    const { pool } = mockHttp(SEARCH_ORIGIN);
    pool.intercept({ path: SEARCH_PATH, method: 'GET' }).reply(200, geocodingEmpty);

    expect(await adapter.search('nowhere')).toEqual([]);
  });

  it('returns multiple candidates for ambiguous names (Springfield)', async () => {
    const { pool } = mockHttp(SEARCH_ORIGIN);
    pool.intercept({ path: SEARCH_PATH, method: 'GET' }).reply(200, geocodingSpringfield);

    const results = await adapter.search('springfield');
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.admin1)).toEqual(['Missouri', 'Illinois', 'Massachusetts']);
  });

  it('honors limit option (passed as `count` param)', async () => {
    const { pool } = mockHttp(SEARCH_ORIGIN);
    let capturedPath: string | undefined;
    pool.intercept({ path: SEARCH_PATH, method: 'GET' }).reply(200, (opts: { path: string }) => {
      capturedPath = opts.path;
      return geocodingLisbon;
    });

    await adapter.search('lisbon', { limit: 3 });
    const url = new URL(`${SEARCH_ORIGIN}${capturedPath}`);
    expect(url.searchParams.get('count')).toBe('3');
  });
});

describe('OpenMeteoGeocodingAdapter — getById', () => {
  it('returns the location on 200', async () => {
    const { pool } = mockHttp(SEARCH_ORIGIN);
    pool.intercept({ path: GET_PATH, method: 'GET' }).reply(200, geocodingLisbon.results[0]);

    const result = await adapter.getById('2267057');
    expect(result?.id).toBe('2267057');
  });

  it('returns null on 404 (unknown id)', async () => {
    const { pool } = mockHttp(SEARCH_ORIGIN);
    pool.intercept({ path: GET_PATH, method: 'GET' }).reply(404, 'Not found');

    expect(await adapter.getById('ghost')).toBeNull();
  });
});
