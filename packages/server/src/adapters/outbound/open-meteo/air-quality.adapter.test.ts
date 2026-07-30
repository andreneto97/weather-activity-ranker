import { describe, expect, it } from '@jest/globals';
import { makeLocation } from '../../../../tests/support/factories.js';
import { mockHttp } from '../../../../tests/support/mock-http.js';
import { NotApplicableError } from '../../../domain/errors.js';
import { createHttpClient } from '../../../infrastructure/http.js';
import airQualityBarcelona from './__fixtures__/air-quality-barcelona.json' with { type: 'json' };
import { createOpenMeteoAirQualityAdapter } from './air-quality.adapter.js';

const ORIGIN = 'https://air-quality-api.open-meteo.com';
const PATH_PREFIX = /^\/v1\/air-quality/;
const http = createHttpClient({ timeoutMs: 500, retries: 0 });
const adapter = createOpenMeteoAirQualityAdapter(http);

const barcelona = makeLocation({
  id: 'geo-barcelona',
  name: 'Barcelona',
  latitude: 41.3874,
  longitude: 2.1686,
  timezone: 'Europe/Madrid',
});

describe('OpenMeteoAirQualityAdapter', () => {
  it('aggregates hourly data into daily AQI means', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(200, airQualityBarcelona);

    const daily = await adapter.getDailyAirQuality(barcelona, 7);
    expect(daily).toHaveLength(7);
    // Barcelona fixture day 1 has aqi [25, 30, 40, 35] → mean 32.5
    expect(daily[0]!.aqiMean).toBeCloseTo(32.5, 5);
  });

  it('sends european_aqi + pm2_5 in the hourly param', async () => {
    const { pool } = mockHttp(ORIGIN);
    let capturedPath: string | undefined;
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(200, (opts: { path: string }) => {
      capturedPath = opts.path;
      return airQualityBarcelona;
    });

    await adapter.getDailyAirQuality(barcelona, 7);
    const url = new URL(`${ORIGIN}${capturedPath}`);
    expect(url.searchParams.get('hourly')).toBe('european_aqi,pm2_5');
  });

  it('translates HTTP 400 into NotApplicableError (region without coverage)', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool
      .intercept({ path: PATH_PREFIX, method: 'GET' })
      .reply(400, { error: true, reason: 'no coverage' });

    await expect(adapter.getDailyAirQuality(barcelona, 7)).rejects.toThrow(NotApplicableError);
  });
});
