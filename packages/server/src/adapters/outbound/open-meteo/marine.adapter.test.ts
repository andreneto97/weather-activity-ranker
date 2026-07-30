import { describe, expect, it } from '@jest/globals';
import { makeLocation } from '../../../../tests/support/factories.js';
import { mockHttp } from '../../../../tests/support/mock-http.js';
import { NotApplicableError, UpstreamError } from '../../../domain/errors.js';
import { createHttpClient } from '../../../infrastructure/http.js';
import marineChamonixError from './__fixtures__/marine-chamonix-error.json' with { type: 'json' };
import marineRio from './__fixtures__/marine-rio.json' with { type: 'json' };
import { createOpenMeteoMarineAdapter } from './marine.adapter.js';

const ORIGIN = 'https://marine-api.open-meteo.com';
const PATH_PREFIX = /^\/v1\/marine/;
const http = createHttpClient({ timeoutMs: 500, retries: 0 });
const adapter = createOpenMeteoMarineAdapter(http);

const rio = makeLocation({
  id: 'geo-rio',
  name: 'Rio de Janeiro',
  latitude: -22.9,
  longitude: -43.2,
  timezone: 'America/Sao_Paulo',
});

const chamonix = makeLocation({
  id: 'geo-chamonix',
  name: 'Chamonix',
  latitude: 45.9,
  longitude: 6.9,
  timezone: 'Europe/Paris',
});

describe('OpenMeteoMarineAdapter', () => {
  it('returns marine week for coastal locations', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(200, marineRio);

    const week = await adapter.getDailyMarine(rio, 7);
    expect(week).toHaveLength(7);
    expect(week[0]!).toEqual({
      date: '2026-07-28',
      waveHeightMaxM: 1.2,
      swellHeightMaxM: 1.0,
      swellPeriodMaxS: 11,
    });
  });

  it('sends cell_selection=sea so bay/estuary cities snap to the nearest ocean cell', async () => {
    // Regression: with cell_selection=nearest, Open-Meteo Marine returns a
    // land grid cell for cities whose centroid sits over a bay (Santos,
    // Piraeus, Sydney Harbour) — every wave field comes back null and the
    // Zod schema rejects the response. `sea` forces the nearest ocean cell.
    const { pool } = mockHttp(ORIGIN);
    let capturedPath: string | undefined;
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(200, (opts: { path: string }) => {
      capturedPath = opts.path;
      return marineRio;
    });

    await adapter.getDailyMarine(rio, 7);
    const url = new URL(`${ORIGIN}${capturedPath}`);
    expect(url.searchParams.get('cell_selection')).toBe('sea');
    expect(url.searchParams.get('length_unit')).toBe('metric');
  });

  it('translates HTTP 400 into NotApplicableError (Chamonix inland)', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(400, marineChamonixError);

    await expect(adapter.getDailyMarine(chamonix, 7)).rejects.toThrow(NotApplicableError);
  });

  it('propagates other UpstreamErrors (500) without swallowing', async () => {
    const { pool } = mockHttp(ORIGIN);
    pool.intercept({ path: PATH_PREFIX, method: 'GET' }).reply(500, 'server down');

    const err = await adapter.getDailyMarine(rio, 7).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamError);
    expect(err).not.toBeInstanceOf(NotApplicableError);
  });
});
