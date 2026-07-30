import { describe, expect, it, jest } from '@jest/globals';
import type { Logger } from 'pino';
import {
  makeAirQualityWeek,
  makeLocation,
  makeMarineWeek,
  makeWeek,
} from '../../tests/support/factories.js';
import { FakeClock } from '../../tests/support/fake-clock.js';
import { InMemoryGeocoding } from '../../tests/support/in-memory-geocoding.js';
import { StubAirQuality } from '../../tests/support/stub-air-quality.js';
import { StubMarine } from '../../tests/support/stub-marine.js';
import { StubSummarizer } from '../../tests/support/stub-summarizer.js';
import { StubWeather } from '../../tests/support/stub-weather.js';
import { defaultScoringWeights } from '../config/scoring.config.js';
import { UpstreamError } from '../domain/errors.js';
import { createIndoorScorer } from '../domain/scoring/indoor-scorer.js';
import { createOutdoorScorer } from '../domain/scoring/outdoor-scorer.js';
import { ScorerRegistry } from '../domain/scoring/registry.js';
import { createSkiScorer } from '../domain/scoring/ski-scorer.js';
import { createSurfScorer } from '../domain/scoring/surf-scorer.js';
import { makeRankActivitiesUseCase } from './rank-activities.usecase.js';

// ---------- Test harness ----------

const silentLogger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(),
} as unknown as Logger;

interface Harness {
  geocoding: InMemoryGeocoding;
  weather: StubWeather;
  marine: StubMarine;
  airQuality: StubAirQuality;
  summarizer: StubSummarizer;
  clock: FakeClock;
  useCase: ReturnType<typeof makeRankActivitiesUseCase>;
}

const buildHarness = (): Harness => {
  const geocoding = new InMemoryGeocoding();
  const weather = new StubWeather();
  const marine = new StubMarine();
  const airQuality = new StubAirQuality();
  const summarizer = new StubSummarizer();
  const clock = new FakeClock('2026-07-28T12:00:00Z');
  const scorers = new ScorerRegistry()
    .register(createSkiScorer(defaultScoringWeights.ski))
    .register(createSurfScorer(defaultScoringWeights.surf))
    .register(createOutdoorScorer(defaultScoringWeights.outdoor))
    .register(createIndoorScorer(defaultScoringWeights.indoor));
  const useCase = makeRankActivitiesUseCase({
    geocoding,
    weather,
    marine,
    airQuality,
    scorers,
    summarizer,
    clock,
    logger: silentLogger,
    weights: defaultScoringWeights,
  });
  return { geocoding, weather, marine, airQuality, summarizer, clock, useCase };
};

// ---------- Happy path ----------

describe('RankActivitiesUseCase — happy path', () => {
  it('returns Ok with 4 rankings sorted by overallScore desc for a coastal city', async () => {
    const h = buildHarness();
    const lisbon = makeLocation();
    h.geocoding.addSearch('lisbon', [lisbon]);
    h.weather.set(
      lisbon.id,
      makeWeek({ apparentTempMaxC: 22, precipitationProbabilityMaxPct: 10, sunshineHours: 10 }),
    );
    h.marine.set(lisbon.id, makeMarineWeek({ swellHeightMaxM: 1.5, swellPeriodMaxS: 12 }));
    h.airQuality.set(lisbon.id, makeAirQualityWeek({ aqiMean: 30 }));

    const result = await h.useCase.execute({ cityQuery: 'lisbon' });

    if (result.kind !== 'Ok') throw new Error(`expected Ok, got ${result.kind}`);
    expect(result.location).toEqual(lisbon);
    expect(result.rankings).toHaveLength(4);
    expect(result.generatedAt).toEqual(new Date('2026-07-28T12:00:00Z'));

    // Sorted by overallScore desc
    const overalls = result.rankings.map((r) => r.overallScore);
    expect(overalls).toEqual([...overalls].sort((a, b) => b - a));

    // Outdoor should top the ranking on this ideal day
    expect(result.rankings[0]!.activity).toBe('OUTDOOR_SIGHTSEEING');

    // Summary called once with sorted rankings
    expect(h.summarizer.callCount()).toBe(1);
    expect(h.summarizer.lastCall()?.city.name).toBe('Lisbon');
  });

  it('locationId path skips geocoding.search', async () => {
    const h = buildHarness();
    const lisbon = makeLocation();
    h.geocoding.addLocation(lisbon);
    h.weather.set(lisbon.id, makeWeek());
    h.marine.set(lisbon.id, makeMarineWeek());
    h.airQuality.set(lisbon.id, makeAirQualityWeek());

    const searchSpy = jest.spyOn(h.geocoding, 'search');

    const result = await h.useCase.execute({ locationId: lisbon.id });
    expect(result.kind).toBe('Ok');
    expect(searchSpy).not.toHaveBeenCalled();
  });
});

// ---------- CityNotFound ----------

describe('RankActivitiesUseCase — CityNotFound', () => {
  it('returns CityNotFound when geocoding.search returns []', async () => {
    const h = buildHarness();
    const result = await h.useCase.execute({ cityQuery: 'nowhere' });
    expect(result).toEqual({ kind: 'CityNotFound', query: 'nowhere' });
  });

  it('returns CityNotFound when locationId is unknown', async () => {
    const h = buildHarness();
    const result = await h.useCase.execute({ locationId: 'ghost-id' });
    expect(result).toEqual({ kind: 'CityNotFound', query: 'ghost-id' });
  });

  it('returns CityNotFound with empty query when neither cityQuery nor locationId provided', async () => {
    const h = buildHarness();
    const result = await h.useCase.execute({});
    expect(result).toEqual({ kind: 'CityNotFound', query: '' });
  });
});

// ---------- AmbiguousLocation ----------

describe('RankActivitiesUseCase — AmbiguousLocation', () => {
  it('returns AmbiguousLocation when two candidates have similar populations', async () => {
    const h = buildHarness();
    const springfieldMO = makeLocation({
      id: 'sp-mo',
      name: 'Springfield',
      country: 'US',
      admin1: 'Missouri',
      population: 170_000,
    });
    const springfieldIL = makeLocation({
      id: 'sp-il',
      name: 'Springfield',
      country: 'US',
      admin1: 'Illinois',
      population: 115_000,
    });
    h.geocoding.addSearch('springfield', [springfieldMO, springfieldIL]);

    const result = await h.useCase.execute({ cityQuery: 'springfield' });
    if (result.kind !== 'AmbiguousLocation') {
      throw new Error(`expected AmbiguousLocation, got ${result.kind}`);
    }
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]!.id).toBe('sp-mo');
  });

  it('auto-picks top when population > 2× second (heuristic)', async () => {
    const h = buildHarness();
    const paris = makeLocation({ id: 'paris-fr', name: 'Paris', population: 2_100_000 });
    const parisTX = makeLocation({
      id: 'paris-tx',
      name: 'Paris',
      country: 'US',
      population: 25_000,
    });
    h.geocoding.addSearch('paris', [paris, parisTX]);
    h.weather.set(paris.id, makeWeek());
    h.marine.set(paris.id, makeMarineWeek());
    h.airQuality.set(paris.id, makeAirQualityWeek());

    const result = await h.useCase.execute({ cityQuery: 'paris' });
    if (result.kind !== 'Ok') throw new Error(`expected Ok (auto-picked), got ${result.kind}`);
    expect(result.location.id).toBe('paris-fr');
  });

  it('sorts candidates by population desc even when geocoder returns relevance order', async () => {
    // Real-world reproduction: Open-Meteo geocoding returns candidates by its
    // own relevance score, not by population. Springfield MO (169k), IL (114k)
    // and MA (153k) — MA outranks IL by population but Open-Meteo may put IL
    // higher for a US-relevance query. The use case must re-sort so both the
    // heuristic AND the response to the client see population order.
    const h = buildHarness();
    const springfieldMO = makeLocation({
      id: 'sp-mo',
      name: 'Springfield',
      admin1: 'Missouri',
      population: 169_000,
    });
    const springfieldIL = makeLocation({
      id: 'sp-il',
      name: 'Springfield',
      admin1: 'Illinois',
      population: 114_000,
    });
    const springfieldMA = makeLocation({
      id: 'sp-ma',
      name: 'Springfield',
      admin1: 'Massachusetts',
      population: 153_000,
    });
    // Deliberately NOT population-sorted (mirrors Open-Meteo relevance order).
    h.geocoding.addSearch('springfield', [springfieldMO, springfieldIL, springfieldMA]);

    const result = await h.useCase.execute({ cityQuery: 'springfield' });
    if (result.kind !== 'AmbiguousLocation') {
      throw new Error(`expected AmbiguousLocation, got ${result.kind}`);
    }
    expect(result.candidates.map((c) => c.id)).toEqual(['sp-mo', 'sp-ma', 'sp-il']);
  });

  it('falls back to AmbiguousLocation when top candidate has no population data', async () => {
    const h = buildHarness();
    // makeLocation() default has population set; strip it via spread reassignment
    // to comply with exactOptionalPropertyTypes.
    const { population: _p, ...aWithoutPop } = makeLocation({ id: 'a' });
    const a = aWithoutPop;
    const b = makeLocation({ id: 'b', population: 100_000 });
    h.geocoding.addSearch('x', [a, b]);

    const result = await h.useCase.execute({ cityQuery: 'x' });
    expect(result.kind).toBe('AmbiguousLocation');
  });
});

// ---------- UpstreamUnavailable (fatal path — forecast) ----------

describe('RankActivitiesUseCase — UpstreamUnavailable', () => {
  it('returns UpstreamUnavailable when forecast throws', async () => {
    const h = buildHarness();
    const lisbon = makeLocation();
    h.geocoding.addSearch('lisbon', [lisbon]);
    h.weather.set(lisbon.id, makeWeek()).throwOn(lisbon.id);

    const result = await h.useCase.execute({ cityQuery: 'lisbon' });
    if (result.kind !== 'UpstreamUnavailable') {
      throw new Error(`expected UpstreamUnavailable, got ${result.kind}`);
    }
    expect(result.provider).toBe('open-meteo-forecast');
    expect(result.cause).toContain('stub failure');
  });

  it('returns UpstreamUnavailable when geocoding throws', async () => {
    const h = buildHarness();
    jest
      .spyOn(h.geocoding, 'search')
      .mockRejectedValueOnce(new UpstreamError('open-meteo-geocoding', '503 bad gateway'));

    const result = await h.useCase.execute({ cityQuery: 'lisbon' });
    if (result.kind !== 'UpstreamUnavailable') {
      throw new Error(`expected UpstreamUnavailable, got ${result.kind}`);
    }
    expect(result.provider).toBe('open-meteo-geocoding');
  });
});

// ---------- Partial failure — Marine ----------

describe('RankActivitiesUseCase — partial failure', () => {
  it('inland city (Chamonix): Surfing gets notApplicable, other 3 activities normal', async () => {
    const h = buildHarness();
    const chamonix = makeLocation({
      id: 'geo-chamonix',
      name: 'Chamonix',
      country: 'France',
      timezone: 'Europe/Paris',
    });
    h.geocoding.addSearch('chamonix', [chamonix]);
    // Cold + snowy → ski should score high
    h.weather.set(
      chamonix.id,
      makeWeek({
        snowfallCm: 20,
        temperature: { minC: -8, maxC: -3 },
        cloudCoverPct: 25,
        precipitationProbabilityMaxPct: 30,
      }),
    );
    // No marine stubbed → StubMarine throws NotApplicableError
    h.airQuality.set(chamonix.id, makeAirQualityWeek());

    const result = await h.useCase.execute({ cityQuery: 'chamonix' });
    if (result.kind !== 'Ok') throw new Error(`expected Ok, got ${result.kind}`);
    expect(result.rankings).toHaveLength(4);

    const surf = result.rankings.find((r) => r.activity === 'SURFING')!;
    expect(surf.overallScore).toBe(0);
    expect(surf.dailyScores[0]!.score.components[0]!.label).toBe('No coastal access');

    const ski = result.rankings.find((r) => r.activity === 'SKIING')!;
    expect(ski.overallScore).toBeGreaterThan(50);
  });

  it('Marine UpstreamError (not NotApplicable) still degrades to notApplicable score, does not fail request', async () => {
    const h = buildHarness();
    const lisbon = makeLocation();
    h.geocoding.addSearch('lisbon', [lisbon]);
    h.weather.set(lisbon.id, makeWeek());
    h.marine.set(lisbon.id, makeMarineWeek()).throwOn(lisbon.id);
    h.airQuality.set(lisbon.id, makeAirQualityWeek());

    const result = await h.useCase.execute({ cityQuery: 'lisbon' });
    if (result.kind !== 'Ok') throw new Error(`expected Ok, got ${result.kind}`);
    const surf = result.rankings.find((r) => r.activity === 'SURFING')!;
    expect(surf.overallScore).toBe(0);
  });

  it('AQI unavailable: outdoor scorer renormalizes without clean-air component', async () => {
    const h = buildHarness();
    const remote = makeLocation({ id: 'geo-remote' });
    h.geocoding.addSearch('remote', [remote]);
    h.weather.set(
      remote.id,
      makeWeek({ apparentTempMaxC: 22, precipitationProbabilityMaxPct: 10, sunshineHours: 10 }),
    );
    h.marine.set(remote.id, makeMarineWeek());
    // No AQI stubbed → StubAirQuality throws NotApplicableError

    const result = await h.useCase.execute({ cityQuery: 'remote' });
    if (result.kind !== 'Ok') throw new Error(`expected Ok, got ${result.kind}`);
    const outdoor = result.rankings.find((r) => r.activity === 'OUTDOOR_SIGHTSEEING')!;
    expect(outdoor.overallScore).toBeGreaterThanOrEqual(90);
    expect(outdoor.dailyScores[0]!.score.components.some((c) => c.label === 'clean air')).toBe(
      false,
    );
  });
});

// ---------- Sorting & summary ----------

describe('RankActivitiesUseCase — sorting + summary', () => {
  it('always returns 4 rankings even when one is Not Applicable (Chamonix Surfing)', async () => {
    const h = buildHarness();
    const chamonix = makeLocation({ id: 'geo-chamonix', name: 'Chamonix' });
    h.geocoding.addSearch('chamonix', [chamonix]);
    h.weather.set(chamonix.id, makeWeek());
    h.airQuality.set(chamonix.id, makeAirQualityWeek());

    const result = await h.useCase.execute({ cityQuery: 'chamonix' });
    if (result.kind !== 'Ok') throw new Error(`expected Ok, got ${result.kind}`);
    expect(result.rankings.map((r) => r.activity).sort()).toEqual([
      'INDOOR_SIGHTSEEING',
      'OUTDOOR_SIGHTSEEING',
      'SKIING',
      'SURFING',
    ]);
  });

  it('summary receives rankings already sorted by overallScore desc', async () => {
    const h = buildHarness();
    const lisbon = makeLocation();
    h.geocoding.addSearch('lisbon', [lisbon]);
    h.weather.set(lisbon.id, makeWeek({ apparentTempMaxC: 22 }));
    h.marine.set(lisbon.id, makeMarineWeek({ swellHeightMaxM: 1.5, swellPeriodMaxS: 12 }));
    h.airQuality.set(lisbon.id, makeAirQualityWeek());

    await h.useCase.execute({ cityQuery: 'lisbon' });
    const passed = h.summarizer.lastCall()!.rankings.map((r) => r.overallScore);
    expect(passed).toEqual([...passed].sort((a, b) => b - a));
  });
});
