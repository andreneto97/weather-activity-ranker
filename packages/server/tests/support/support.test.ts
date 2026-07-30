import { NotApplicableError, UpstreamError } from '../../src/domain/errors.js';
import {
  makeAirQualityWeek,
  makeLocation,
  makeMarineWeek,
  makeWeek,
  sevenDates,
} from './factories.js';
import { FakeClock } from './fake-clock.js';
import { InMemoryGeocoding } from './in-memory-geocoding.js';
import { StubAirQuality } from './stub-air-quality.js';
import { StubMarine } from './stub-marine.js';
import { StubSummarizer } from './stub-summarizer.js';
import { StubWeather } from './stub-weather.js';

describe('test support fakes', () => {
  describe('FakeClock', () => {
    it('returns the frozen time and advances on demand', () => {
      const clock = new FakeClock('2026-07-28T12:00:00Z');
      expect(clock.now().toISOString()).toBe('2026-07-28T12:00:00.000Z');
      clock.advance(60_000);
      expect(clock.now().toISOString()).toBe('2026-07-28T12:01:00.000Z');
    });

    it('does not leak internal Date reference', () => {
      const clock = new FakeClock('2026-07-28T12:00:00Z');
      const first = clock.now();
      first.setUTCFullYear(1999);
      expect(clock.now().toISOString()).toBe('2026-07-28T12:00:00.000Z');
    });
  });

  describe('InMemoryGeocoding', () => {
    const lisbon = makeLocation();
    const madrid = makeLocation({ id: 'geo-madrid', name: 'Madrid', country: 'Spain' });

    it('normalizes query (case + trim)', async () => {
      const g = new InMemoryGeocoding().addSearch('Lisbon', [lisbon]);
      expect(await g.search('lisbon')).toEqual([lisbon]);
      expect(await g.search('  LISBON  ')).toEqual([lisbon]);
    });

    it('returns [] on unknown query', async () => {
      const g = new InMemoryGeocoding();
      expect(await g.search('atlantis')).toEqual([]);
    });

    it('honors limit option', async () => {
      const g = new InMemoryGeocoding().addSearch('multi', [lisbon, madrid]);
      expect(await g.search('multi', { limit: 1 })).toEqual([lisbon]);
    });

    it('getById auto-indexes from addSearch', async () => {
      const g = new InMemoryGeocoding().addSearch('lisbon', [lisbon]);
      expect(await g.getById('geo-lisbon')).toEqual(lisbon);
      expect(await g.getById('unknown')).toBeNull();
    });
  });

  describe('StubWeather', () => {
    const loc = makeLocation();

    it('returns exactly N days of the stub week', async () => {
      const stub = new StubWeather().set(loc.id, makeWeek());
      expect(await stub.getDailyForecast(loc, 7)).toHaveLength(7);
      expect(await stub.getDailyForecast(loc, 3)).toHaveLength(3);
    });

    it('throws UpstreamError for unknown location', async () => {
      const stub = new StubWeather();
      await expect(stub.getDailyForecast(loc, 7)).rejects.toThrow(UpstreamError);
    });

    it('throwOn triggers a one-time failure', async () => {
      const stub = new StubWeather().set(loc.id, makeWeek()).throwOn(loc.id);
      await expect(stub.getDailyForecast(loc, 7)).rejects.toThrow(UpstreamError);
      // Second call succeeds now that the toggle was consumed.
      await expect(stub.getDailyForecast(loc, 7)).resolves.toHaveLength(7);
    });
  });

  describe('StubMarine', () => {
    const rio = makeLocation({ id: 'geo-rio', name: 'Rio de Janeiro' });
    const chamonix = makeLocation({ id: 'geo-chamonix', name: 'Chamonix' });

    it('returns marine week for coastal locations', async () => {
      const stub = new StubMarine().set(rio.id, makeMarineWeek());
      expect(await stub.getDailyMarine(rio, 7)).toHaveLength(7);
    });

    it('throws NotApplicableError for inland locations without stub', async () => {
      const stub = new StubMarine();
      await expect(stub.getDailyMarine(chamonix, 7)).rejects.toThrow(NotApplicableError);
    });

    it('throwOn triggers UpstreamError (not NotApplicable)', async () => {
      const stub = new StubMarine().set(rio.id, makeMarineWeek()).throwOn(rio.id);
      await expect(stub.getDailyMarine(rio, 7)).rejects.toThrow(UpstreamError);
    });
  });

  describe('StubAirQuality', () => {
    const loc = makeLocation();

    it('returns AQI week when stubbed', async () => {
      const stub = new StubAirQuality().set(loc.id, makeAirQualityWeek());
      expect(await stub.getDailyAirQuality(loc, 7)).toHaveLength(7);
    });

    it('throws NotApplicableError when unstubbed', async () => {
      const stub = new StubAirQuality();
      await expect(stub.getDailyAirQuality(loc, 7)).rejects.toThrow(NotApplicableError);
    });
  });

  describe('StubSummarizer', () => {
    const lisbon = makeLocation();

    it('records calls and returns default template', async () => {
      const stub = new StubSummarizer();
      const out = await stub.summarize({
        city: lisbon,
        rankings: [],
        generatedAt: new Date(),
      });
      expect(out).toContain('Lisbon');
      expect(stub.callCount()).toBe(1);
      expect(stub.lastCall()?.city.name).toBe('Lisbon');
    });

    it('honors custom render fn', async () => {
      const stub = new StubSummarizer(() => 'hello world');
      const out = await stub.summarize({
        city: lisbon,
        rankings: [],
        generatedAt: new Date(),
      });
      expect(out).toBe('hello world');
    });
  });

  describe('factories', () => {
    it('sevenDates returns 7 consecutive ISO dates', () => {
      const dates = sevenDates('2026-07-28');
      expect(dates).toEqual([
        '2026-07-28',
        '2026-07-29',
        '2026-07-30',
        '2026-07-31',
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
      ]);
    });

    it('makeWeek respects overrides and per-day dates', () => {
      const week = makeWeek({ snowfallCm: 5 });
      expect(week).toHaveLength(7);
      expect(week[0]!.date).toBe('2026-07-28');
      expect(week[6]!.date).toBe('2026-08-03');
      expect(week.every((d) => d.snowfallCm === 5)).toBe(true);
    });
  });
});
