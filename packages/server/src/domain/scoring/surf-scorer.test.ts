import fc from 'fast-check';
import { defaultScoringWeights } from '../../config/scoring.config.js';
import type { DailyWeather, MarineDaily } from '../daily-weather.js';
import type { ScoringContext } from './scorer.js';
import { createSurfScorer } from './surf-scorer.js';

const scorer = createSurfScorer(defaultScoringWeights.surf);

const makeDay = (overrides: Partial<DailyWeather> = {}): DailyWeather => ({
  date: '2026-07-28',
  temperature: { minC: 18, maxC: 22 },
  apparentTempMaxC: 22,
  precipitationMm: 0,
  precipitationProbabilityMaxPct: 10,
  snowfallCm: 0,
  wind: { maxKmh: 10, gustsKmh: 15 },
  cloudCoverPct: 30,
  uvIndexMax: 8,
  sunshineHours: 10,
  weatherCode: 1,
  ...overrides,
});

const makeMarine = (overrides: Partial<MarineDaily> = {}): MarineDaily => ({
  date: '2026-07-28',
  waveHeightMaxM: 1.5,
  swellHeightMaxM: 1.5,
  swellPeriodMaxS: 12,
  ...overrides,
});

const ctxWith = (marine?: MarineDaily): ScoringContext => ({
  weights: defaultScoringWeights,
  ...(marine ? { marine } : {}),
});

describe('SurfScorer', () => {
  it('reports SURFING activity', () => {
    expect(scorer.activity).toBe('SURFING');
  });

  it('returns notApplicable when marine data is absent (inland city)', () => {
    const s = scorer.score(makeDay(), ctxWith());
    expect(s.value).toBe(0);
    expect(s.components).toEqual([{ label: 'No coastal access', value: 0, weight: 1 }]);
  });

  it('scores high on ideal conditions (1.5m swell, 12s period, light wind, warm)', () => {
    const s = scorer.score(makeDay(), ctxWith(makeMarine()));
    expect(s.value).toBeGreaterThanOrEqual(90);
  });

  it('scores low on chop (small swell, short period, onshore wind)', () => {
    const s = scorer.score(
      makeDay({ wind: { maxKmh: 30, gustsKmh: 40 } }),
      ctxWith(makeMarine({ swellHeightMaxM: 0.2, swellPeriodMaxS: 4 })),
    );
    expect(s.value).toBeLessThan(20);
  });

  it('penalises onshore wind heavily even with good swell', () => {
    const goodSwellCalm = scorer.score(makeDay(), ctxWith(makeMarine())).value;
    const goodSwellWindy = scorer.score(
      makeDay({ wind: { maxKmh: 30, gustsKmh: 40 } }),
      ctxWith(makeMarine()),
    ).value;
    expect(goodSwellWindy).toBeLessThan(goodSwellCalm);
  });

  it('property: score always integer in [0, 100] with or without marine', () => {
    fc.assert(
      fc.property(
        fc.option(
          fc.record({
            swellHeightMaxM: fc.double({ min: 0, max: 10, noNaN: true }),
            swellPeriodMaxS: fc.double({ min: 0, max: 30, noNaN: true }),
          }),
          { nil: undefined },
        ),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: -20, max: 45, noNaN: true }),
        (marineInput, wind, temp) => {
          const marine = marineInput
            ? makeMarine({
                swellHeightMaxM: marineInput.swellHeightMaxM,
                swellPeriodMaxS: marineInput.swellPeriodMaxS,
              })
            : undefined;
          const day = makeDay({
            wind: { maxKmh: wind, gustsKmh: wind },
            temperature: { minC: temp - 5, maxC: temp },
          });
          const s = scorer.score(day, ctxWith(marine));
          return Number.isInteger(s.value) && s.value >= 0 && s.value <= 100;
        },
      ),
    );
  });
});
