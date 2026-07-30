import { describe, expect, it } from '@jest/globals';
import { buildContainer } from './composition-root.js';
import { loadEnv } from './infrastructure/env.js';

describe('buildContainer', () => {
  it('wires a stub-mode container end-to-end (no network)', async () => {
    const env = loadEnv({ OPEN_METEO_MODE: 'stub', LOG_LEVEL: 'silent' });
    const container = buildContainer(env);

    // Smoke test: run the real use case against the real stub adapters.
    const result = await container.rankActivities.execute({ cityQuery: 'Lisbon' });
    if (result.kind !== 'Ok') throw new Error(`expected Ok, got ${result.kind}`);
    expect(result.location.name).toBe('Lisbon');
    expect(result.rankings).toHaveLength(4);
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('Chamonix + stub mode: Surfing degrades to Not Applicable', async () => {
    const env = loadEnv({ OPEN_METEO_MODE: 'stub', LOG_LEVEL: 'silent' });
    const container = buildContainer(env);

    const result = await container.rankActivities.execute({ cityQuery: 'Chamonix' });
    if (result.kind !== 'Ok') throw new Error(`expected Ok, got ${result.kind}`);
    const surfing = result.rankings.find((r) => r.activity === 'SURFING');
    expect(surfing?.overallScore).toBe(0);
    expect(surfing?.bestDay.score.components[0]?.label).toBe('No coastal access');
  });

  it('Springfield → AmbiguousLocation from real ambiguity heuristic', async () => {
    const env = loadEnv({ OPEN_METEO_MODE: 'stub', LOG_LEVEL: 'silent' });
    const container = buildContainer(env);
    const result = await container.rankActivities.execute({ cityQuery: 'Springfield' });
    expect(result.kind).toBe('AmbiguousLocation');
  });

  it('unknown city → CityNotFound', async () => {
    const env = loadEnv({ OPEN_METEO_MODE: 'stub', LOG_LEVEL: 'silent' });
    const container = buildContainer(env);
    const result = await container.rankActivities.execute({ cityQuery: 'atlantis-xyz' });
    expect(result.kind).toBe('CityNotFound');
  });

  it('exposes cache-wrapped adapters on the container', () => {
    const env = loadEnv({ OPEN_METEO_MODE: 'stub', LOG_LEVEL: 'silent' });
    const container = buildContainer(env);
    // Presence check — types guard shape.
    expect(container.geocoding).toBeDefined();
    expect(container.weather).toBeDefined();
    expect(container.marine).toBeDefined();
    expect(container.airQuality).toBeDefined();
  });
});
