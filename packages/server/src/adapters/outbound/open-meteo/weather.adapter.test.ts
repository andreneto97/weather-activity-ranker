import { describe, expect, it } from '@jest/globals';
import { makeLocation } from '../../../../tests/support/factories.js';
import { mockHttp } from '../../../../tests/support/mock-http.js';
import { UpstreamError } from '../../../domain/errors.js';
import { createHttpClient } from '../../../infrastructure/http.js';
import forecastLisbon from './__fixtures__/forecast-lisbon.json' with { type: 'json' };
import { createOpenMeteoWeatherAdapter } from './weather.adapter.js';

const ORIGIN = 'https://api.open-meteo.com';
const PATH_PREFIX = /^\/v1\/forecast/;
const http = createHttpClient({ timeoutMs: 500, retries: 1 });
const adapter = createOpenMeteoWeatherAdapter(http);
const lisbon = makeLocation();

describe('OpenMeteoWeatherAdapter', () => {
  it('returns a normalised 7-day week on happy path', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(200, forecastLisbon);

    const week = await adapter.getDailyForecast(lisbon, 7);
    expect(week).toHaveLength(7);
    expect(week[0]!.date).toBe('2026-07-28');
    expect(week[0]!.temperature.maxC).toBe(28);
  });

  it('sends latitude, longitude, timezone and requested days', async () => {
    const { pool } = mockHttp(ORIGIN);
    let capturedPath: string | undefined;
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(200, (opts: { path: string }) => {
      capturedPath = opts.path;
      return forecastLisbon;
    });

    await adapter.getDailyForecast(lisbon, 7);
    const url = new URL(`${ORIGIN}${capturedPath}`);
    expect(url.searchParams.get('latitude')).toBe(String(lisbon.latitude));
    expect(url.searchParams.get('longitude')).toBe(String(lisbon.longitude));
    expect(url.searchParams.get('timezone')).toBe(lisbon.timezone);
    expect(url.searchParams.get('forecast_days')).toBe('7');
    expect(url.searchParams.get('daily')).toContain('snowfall_sum');
  });

  it('translates HTTP 500 into UpstreamError after retry', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(500, 'internal');
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(500, 'internal');

    await expect(adapter.getDailyForecast(lisbon, 7)).rejects.toThrow(UpstreamError);
  });

  it('does not retry on 400 (bad params)', async () => {
    const { pool } = mockHttp(ORIGIN);
    // Only one interceptor set; retry would fail with "no interceptor" (test intent)
    pool
      .intercept({ path: PATH_PREFIX, method: 'GET' })
      .reply(400, { error: true, reason: 'bad latitude' });

    await expect(adapter.getDailyForecast(lisbon, 7)).rejects.toThrow(/HTTP 400/);
  });
});
