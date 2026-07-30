import fc from 'fast-check';
import { defaultScoringWeights } from '../../config/scoring.config.js';
import type { DailyWeather } from '../daily-weather.js';
import type { ScoringContext } from './scorer.js';
import { createSkiScorer } from './ski-scorer.js';

const scorer = createSkiScorer(defaultScoringWeights.ski);

const makeDay = (overrides: Partial<DailyWeather> = {}): DailyWeather => ({
  date: '2026-01-15',
  temperature: { minC: -8, maxC: -3 },
  apparentTempMaxC: -5,
  precipitationMm: 5,
  precipitationProbabilityMaxPct: 60,
  snowfallCm: 20,
  wind: { maxKmh: 5, gustsKmh: 8 },
  cloudCoverPct: 25,
  uvIndexMax: 2,
  sunshineHours: 4,
  weatherCode: 71,
  ...overrides,
});

const ctx: ScoringContext = { weights: defaultScoringWeights };

describe('SkiScorer', () => {
  it('reports SKIING activity', () => {
    expect(scorer.activity).toBe('SKIING');
  });

  it.each<[string, Partial<DailyWeather>, (n: number) => boolean]>([
    ['perfect: 20cm snow, -3°C, calm, clear', {}, (v) => v >= 90],
    [
      'terrible: no snow, 10°C, windy, overcast',
      {
        snowfallCm: 0,
        temperature: { minC: 5, maxC: 15 },
        wind: { maxKmh: 40, gustsKmh: 80 },
        cloudCoverPct: 100,
      },
      (v) => v <= 10,
    ],
    [
      'melty: 20cm snow but 8°C',
      { snowfallCm: 20, temperature: { minC: 2, maxC: 8 } },
      (v) => v < 80,
    ],
    ['icy: no fresh snow', { snowfallCm: 0 }, (v) => v < 60],
    ['gusty: gusts 60 km/h', { wind: { maxKmh: 30, gustsKmh: 60 } }, (v) => v <= 80],
    ['blizzard visibility: 100% cloud', { cloudCoverPct: 100 }, (v) => v < 100],
  ])('%s scores predictably', (_label, overrides, check) => {
    const s = scorer.score(makeDay(overrides), ctx);
    expect(check(s.value)).toBe(true);
  });

  it('returns integer score in [0, 100] for any input (property)', () => {
    fc.assert(
      fc.property(
        fc.record({
          snowfallCm: fc.double({ min: 0, max: 100, noNaN: true }),
          tempMaxC: fc.double({ min: -40, max: 40, noNaN: true }),
          gustsKmh: fc.double({ min: 0, max: 150, noNaN: true }),
          cloudCoverPct: fc.double({ min: 0, max: 100, noNaN: true }),
        }),
        (input) => {
          const day = makeDay({
            snowfallCm: input.snowfallCm,
            temperature: { minC: input.tempMaxC - 5, maxC: input.tempMaxC },
            wind: { maxKmh: input.gustsKmh * 0.7, gustsKmh: input.gustsKmh },
            cloudCoverPct: input.cloudCoverPct,
          });
          const s = scorer.score(day, ctx);
          return Number.isInteger(s.value) && s.value >= 0 && s.value <= 100;
        },
      ),
    );
  });

  it('is monotonic in snowfall within [0, 20] cm (all else equal)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 20, noNaN: true }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        (a, b) => {
          const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
          const scoreLo = scorer.score(makeDay({ snowfallCm: lo }), ctx).value;
          const scoreHi = scorer.score(makeDay({ snowfallCm: hi }), ctx).value;
          return scoreLo <= scoreHi;
        },
      ),
    );
  });

  it('sorts components by weight desc', () => {
    const s = scorer.score(makeDay(), ctx);
    const weights = s.components.map((c) => c.weight);
    const sorted = [...weights].sort((a, b) => b - a);
    expect(weights).toEqual(sorted);
  });
});
