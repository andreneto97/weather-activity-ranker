import fc from 'fast-check';
import { defaultScoringWeights } from '../../config/scoring.config.js';
import type { DailyWeather } from '../daily-weather.js';
import { createIndoorScorer } from './indoor-scorer.js';
import type { ScoringContext } from './scorer.js';

const scorer = createIndoorScorer(defaultScoringWeights.indoor);

const makeDay = (overrides: Partial<DailyWeather> = {}): DailyWeather => ({
  date: '2026-11-15',
  temperature: { minC: 8, maxC: 12 },
  apparentTempMaxC: 10,
  precipitationMm: 5,
  precipitationProbabilityMaxPct: 80,
  snowfallCm: 0,
  wind: { maxKmh: 30, gustsKmh: 40 },
  cloudCoverPct: 90,
  uvIndexMax: 2,
  sunshineHours: 1,
  weatherCode: 61,
  ...overrides,
});

const ctx: ScoringContext = { weights: defaultScoringWeights };

describe('IndoorScorer', () => {
  it('reports INDOOR_SIGHTSEEING activity', () => {
    expect(scorer.activity).toBe('INDOOR_SIGHTSEEING');
  });

  it('scores high on rainy/cold/overcast/windy day (perfect museum weather)', () => {
    const s = scorer.score(makeDay(), ctx);
    expect(s.value).toBeGreaterThan(70);
  });

  it('scores low on perfect outdoor day (22°C, no rain, clear)', () => {
    const s = scorer.score(
      makeDay({
        apparentTempMaxC: 22,
        precipitationProbabilityMaxPct: 10,
        cloudCoverPct: 20,
        wind: { maxKmh: 8, gustsKmh: 12 },
      }),
      ctx,
    );
    expect(s.value).toBeLessThan(20);
  });

  it('is monotonic in precipitation probability (holding everything else fixed)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 20, max: 80, noNaN: true }),
        fc.double({ min: 20, max: 80, noNaN: true }),
        (a, b) => {
          const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
          const scoreLo = scorer.score(makeDay({ precipitationProbabilityMaxPct: lo }), ctx).value;
          const scoreHi = scorer.score(makeDay({ precipitationProbabilityMaxPct: hi }), ctx).value;
          return scoreLo <= scoreHi;
        },
      ),
    );
  });

  it('is inverse of outdoor: extreme temps score high (both cold and hot)', () => {
    // Both cold (0°C) and hot (35°C) should score higher than mild (22°C)
    const mild = scorer.score(makeDay({ apparentTempMaxC: 22 }), ctx).value;
    const cold = scorer.score(makeDay({ apparentTempMaxC: 0 }), ctx).value;
    const hot = scorer.score(makeDay({ apparentTempMaxC: 35 }), ctx).value;
    expect(cold).toBeGreaterThan(mild);
    expect(hot).toBeGreaterThan(mild);
  });

  it('property: score always integer in [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.record({
          apparentTempMaxC: fc.double({ min: -30, max: 50, noNaN: true }),
          precipitationProbabilityMaxPct: fc.double({ min: 0, max: 100, noNaN: true }),
          cloudCoverPct: fc.double({ min: 0, max: 100, noNaN: true }),
          gustsKmh: fc.double({ min: 0, max: 150, noNaN: true }),
        }),
        (input) => {
          const day = makeDay({
            apparentTempMaxC: input.apparentTempMaxC,
            precipitationProbabilityMaxPct: input.precipitationProbabilityMaxPct,
            cloudCoverPct: input.cloudCoverPct,
            wind: { maxKmh: input.gustsKmh * 0.7, gustsKmh: input.gustsKmh },
          });
          const s = scorer.score(day, ctx);
          return Number.isInteger(s.value) && s.value >= 0 && s.value <= 100;
        },
      ),
    );
  });
});
