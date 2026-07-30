import fc from 'fast-check';
import { defaultScoringWeights } from '../../config/scoring.config.js';
import type { AirQualityDaily, DailyWeather } from '../daily-weather.js';
import { createOutdoorScorer } from './outdoor-scorer.js';
import type { ScoringContext } from './scorer.js';

const scorer = createOutdoorScorer(defaultScoringWeights.outdoor);

const makeDay = (overrides: Partial<DailyWeather> = {}): DailyWeather => ({
  date: '2026-05-15',
  temperature: { minC: 18, maxC: 22 },
  apparentTempMaxC: 22,
  precipitationMm: 0,
  precipitationProbabilityMaxPct: 10,
  snowfallCm: 0,
  wind: { maxKmh: 8, gustsKmh: 12 },
  cloudCoverPct: 20,
  uvIndexMax: 5,
  sunshineHours: 9,
  weatherCode: 0,
  ...overrides,
});

const makeAir = (overrides: Partial<AirQualityDaily> = {}): AirQualityDaily => ({
  date: '2026-05-15',
  aqiMean: 30,
  pm25MeanUgm3: 8,
  ...overrides,
});

const ctxWith = (airQuality?: AirQualityDaily): ScoringContext => ({
  weights: defaultScoringWeights,
  ...(airQuality ? { airQuality } : {}),
});

describe('OutdoorScorer', () => {
  it('reports OUTDOOR_SIGHTSEEING activity', () => {
    expect(scorer.activity).toBe('OUTDOOR_SIGHTSEEING');
  });

  it('scores high on ideal conditions (22°C, no rain, sunny, clean air)', () => {
    const s = scorer.score(makeDay(), ctxWith(makeAir()));
    expect(s.value).toBeGreaterThanOrEqual(90);
  });

  it('scores low on rainy cold day', () => {
    const s = scorer.score(
      makeDay({
        apparentTempMaxC: 2, // below comfort
        precipitationProbabilityMaxPct: 90, // heavy rain expected
        sunshineHours: 0, // grey
        cloudCoverPct: 100,
        uvIndexMax: 10, // brutal UV would push moderate-UV to 0 too
      }),
      ctxWith(makeAir({ aqiMean: 150 })),
    );
    // All 5 components collapse: temp=0, rain=0, sunshine=0, uv=0, air=0.
    expect(s.value).toBe(0);
  });

  it('renormalizes when AQI missing (still scores 100 on otherwise-ideal day)', () => {
    // Same ideal day, no AQI context — cleanAir component dropped and renormalised
    const s = scorer.score(makeDay(), ctxWith());
    expect(s.value).toBeGreaterThanOrEqual(90);
    // No "clean air" component should appear
    expect(s.components.some((c) => c.label === 'clean air')).toBe(false);
    // Remaining components' weights sum to ~1.0 (rescaled from 0.9)
    const total = s.components.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('includes clean-air component when AQI present', () => {
    const s = scorer.score(makeDay(), ctxWith(makeAir()));
    expect(s.components.some((c) => c.label === 'clean air')).toBe(true);
  });

  it('penalises high AQI (300 = hazardous)', () => {
    const clean = scorer.score(makeDay(), ctxWith(makeAir({ aqiMean: 30 }))).value;
    const dirty = scorer.score(makeDay(), ctxWith(makeAir({ aqiMean: 300 }))).value;
    expect(dirty).toBeLessThan(clean);
  });

  it('property: score always integer in [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.record({
          tempMax: fc.double({ min: -10, max: 45, noNaN: true }),
          precipProb: fc.double({ min: 0, max: 100, noNaN: true }),
          sunshine: fc.double({ min: 0, max: 15, noNaN: true }),
          uv: fc.double({ min: 0, max: 12, noNaN: true }),
          aqi: fc.option(fc.double({ min: 0, max: 400, noNaN: true }), { nil: undefined }),
        }),
        ({ tempMax, precipProb, sunshine, uv, aqi }) => {
          const day = makeDay({
            apparentTempMaxC: tempMax,
            precipitationProbabilityMaxPct: precipProb,
            sunshineHours: sunshine,
            uvIndexMax: uv,
          });
          const air = aqi !== undefined ? makeAir({ aqiMean: aqi }) : undefined;
          const s = scorer.score(day, ctxWith(air));
          return Number.isInteger(s.value) && s.value >= 0 && s.value <= 100;
        },
      ),
    );
  });
});
