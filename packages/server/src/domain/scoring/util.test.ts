import fc from 'fast-check';
import type { DailyWeather } from '../daily-weather.js';
import type { ActivityScorer, ScoringContext } from './scorer.js';
import {
  bell,
  clamp01,
  clamp100Int,
  notApplicableRankedForecast,
  notApplicableScore,
  ramp,
  rampDown,
  rank,
  weightedSum,
  weightedSumRenormalized,
} from './util.js';

// ---------- helpers ----------

const makeDay = (date: string, overrides: Partial<DailyWeather> = {}): DailyWeather => ({
  date,
  temperature: { minC: 12, maxC: 22 },
  apparentTempMaxC: 22,
  precipitationMm: 0,
  precipitationProbabilityMaxPct: 10,
  snowfallCm: 0,
  wind: { maxKmh: 8, gustsKmh: 12 },
  cloudCoverPct: 30,
  uvIndexMax: 5,
  sunshineHours: 8,
  weatherCode: 1,
  ...overrides,
});

// ---------- clamp01 ----------

describe('clamp01', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [2, 1],
  ])('clamps %p to %p', (input, expected) => {
    expect(clamp01(input)).toBe(expected);
  });

  it('property: always in [0, 1]', () => {
    fc.assert(
      fc.property(fc.double(), (x) => {
        const y = clamp01(x);
        return y >= 0 && y <= 1;
      }),
    );
  });
});

// ---------- clamp100Int ----------

describe('clamp100Int', () => {
  it.each([
    [-10, 0],
    [0, 0],
    [50.4, 50],
    [50.6, 51],
    [100, 100],
    [150, 100],
  ])('clamps+rounds %p to %p', (input, expected) => {
    expect(clamp100Int(input)).toBe(expected);
  });

  it('property: always integer in [0, 100]', () => {
    fc.assert(
      fc.property(fc.double(), (x) => {
        const y = clamp100Int(x);
        return Number.isInteger(y) && y >= 0 && y <= 100;
      }),
    );
  });
});

// ---------- bell ----------

describe('bell', () => {
  it('returns 1 at ideal', () => {
    expect(bell(10, 0, 10, 20)).toBe(1);
  });

  it('returns 0 at or beyond zeros', () => {
    expect(bell(0, 0, 10, 20)).toBe(0);
    expect(bell(20, 0, 10, 20)).toBe(0);
    expect(bell(-5, 0, 10, 20)).toBe(0);
    expect(bell(25, 0, 10, 20)).toBe(0);
  });

  it('ramps linearly on both sides', () => {
    expect(bell(5, 0, 10, 20)).toBeCloseTo(0.5);
    expect(bell(15, 0, 10, 20)).toBeCloseTo(0.5);
    expect(bell(2.5, 0, 10, 20)).toBeCloseTo(0.25);
    expect(bell(17.5, 0, 10, 20)).toBeCloseTo(0.25);
  });

  it('throws on invalid ordering', () => {
    expect(() => bell(1, 10, 5, 20)).toThrow(/leftZero < ideal/);
    expect(() => bell(1, 0, 10, 5)).toThrow(/ideal < rightZero/);
  });

  it('property: always in [0, 1] for any x', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        fc.integer({ min: -100, max: 0 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 101, max: 200 }),
        (x, l, i, r) => {
          const y = bell(x, l, i, r);
          return y >= 0 && y <= 1;
        },
      ),
    );
  });

  it('property: peak at ideal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 0 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 101, max: 200 }),
        (l, i, r) => bell(i, l, i, r) === 1,
      ),
    );
  });
});

// ---------- ramp / rampDown ----------

describe('ramp', () => {
  it('ramps 0 → 1 across [zero, full]', () => {
    expect(ramp(0, 0, 10)).toBe(0);
    expect(ramp(5, 0, 10)).toBe(0.5);
    expect(ramp(10, 0, 10)).toBe(1);
    expect(ramp(-1, 0, 10)).toBe(0);
    expect(ramp(20, 0, 10)).toBe(1);
  });

  it('throws on invalid ordering', () => {
    expect(() => ramp(1, 10, 5)).toThrow(/zero < full/);
  });

  it('property: monotonic non-decreasing', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (a, b) => {
          const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
          if (lo === hi) return true;
          return ramp(lo, 0, 10) <= ramp(hi, 0, 10);
        },
      ),
    );
  });
});

describe('rampDown', () => {
  it('inverts ramp on the same range', () => {
    expect(rampDown(0, 0, 10)).toBe(1);
    expect(rampDown(5, 0, 10)).toBe(0.5);
    expect(rampDown(10, 0, 10)).toBe(0);
    expect(rampDown(-1, 0, 10)).toBe(1);
    expect(rampDown(20, 0, 10)).toBe(0);
  });

  it('throws on invalid ordering (full < zero required)', () => {
    expect(() => rampDown(1, 10, 5)).toThrow(/full < zero/);
  });

  it('property: ramp(x, a, b) + rampDown(x, a, b) === 1 for x in [a, b]', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 10, noNaN: true }), (x) => {
        const sum = ramp(x, 0, 10) + rampDown(x, 0, 10);
        return Math.abs(sum - 1) < 1e-9;
      }),
    );
  });
});

// ---------- weightedSum ----------

describe('weightedSum', () => {
  it('produces integer 0..100 score', () => {
    const s = weightedSum([
      { label: 'a', weight: 0.5, value: 1 },
      { label: 'b', weight: 0.5, value: 0 },
    ]);
    expect(s.value).toBe(50);
    expect(Number.isInteger(s.value)).toBe(true);
  });

  it('clamps component values into [0, 1]', () => {
    const s = weightedSum([{ label: 'over', weight: 1, value: 2 }]);
    expect(s.value).toBe(100);
    expect(s.components[0]!.value).toBe(1);
  });

  it('sorts components by weight desc (stable for ties)', () => {
    const s = weightedSum([
      { label: 'low', weight: 0.1, value: 1 },
      { label: 'high', weight: 0.5, value: 1 },
      { label: 'mid-a', weight: 0.2, value: 1 },
      { label: 'mid-b', weight: 0.2, value: 1 },
    ]);
    expect(s.components.map((c) => c.label)).toEqual(['high', 'mid-a', 'mid-b', 'low']);
  });

  it('throws when weights sum > 1', () => {
    expect(() =>
      weightedSum([
        { label: 'a', weight: 0.6, value: 1 },
        { label: 'b', weight: 0.6, value: 1 },
      ]),
    ).toThrow(/sum to 1\.2/);
  });

  it('property: value ∈ [0, 100] for any weights summing ≤ 1', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            label: fc.string(),
            weight: fc.double({ min: 0, max: 0.25, noNaN: true }),
            value: fc.double({ min: -5, max: 5, noNaN: true }),
          }),
          { minLength: 1, maxLength: 4 },
        ),
        (parts) => {
          const s = weightedSum(parts);
          return s.value >= 0 && s.value <= 100 && Number.isInteger(s.value);
        },
      ),
    );
  });
});

// ---------- weightedSumRenormalized ----------

describe('weightedSumRenormalized', () => {
  it('rescales weights to sum to 1', () => {
    // weights 0.3 + 0.3 = 0.6 → rescaled to 0.5 each; both values = 1 → total = 1.0
    const s = weightedSumRenormalized([
      { label: 'a', weight: 0.3, value: 1 },
      { label: 'b', weight: 0.3, value: 1 },
    ]);
    expect(s.value).toBe(100);
  });

  it('skips the sum-≤-1 assertion of weightedSum', () => {
    // weights sum to 2, would fail weightedSum, works here
    const s = weightedSumRenormalized([
      { label: 'a', weight: 1, value: 0.5 },
      { label: 'b', weight: 1, value: 0.5 },
    ]);
    expect(s.value).toBe(50);
  });

  it('throws when total weight is 0', () => {
    expect(() =>
      weightedSumRenormalized([
        { label: 'a', weight: 0, value: 1 },
        { label: 'b', weight: 0, value: 1 },
      ]),
    ).toThrow(/total weight must be > 0/);
  });
});

// ---------- notApplicableScore ----------

describe('notApplicableScore', () => {
  it('always has value 0 and single component with weight 1', () => {
    const s = notApplicableScore('No coastal access');
    expect(s.value).toBe(0);
    expect(s.components).toEqual([{ label: 'No coastal access', value: 0, weight: 1 }]);
  });
});

// ---------- notApplicableRankedForecast ----------

describe('notApplicableRankedForecast', () => {
  const dates = [
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
    '2026-08-02',
    '2026-08-03',
  ];

  it('produces 7 zero-scored days with earliest bestDay', () => {
    const rf = notApplicableRankedForecast('SURFING', dates, 'No coastal access');
    expect(rf.activity).toBe('SURFING');
    expect(rf.dailyScores).toHaveLength(7);
    expect(rf.dailyScores.every((d) => d.score.value === 0)).toBe(true);
    expect(rf.bestDay.date).toBe('2026-07-28');
    expect(rf.overallScore).toBe(0);
  });

  it('throws on empty dates', () => {
    expect(() => notApplicableRankedForecast('SURFING', [], 'reason')).toThrow(/non-empty/);
  });
});

// ---------- rank ----------

describe('rank', () => {
  const dates = [
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
    '2026-08-02',
    '2026-08-03',
  ];
  const week = dates.map((d) => makeDay(d));

  const makeCtx = (): ScoringContext => ({
    weights: { ski: {} as never, surf: {} as never, outdoor: {} as never, indoor: {} as never },
  });

  const constantScorer = (values: number[]): ActivityScorer => ({
    activity: 'OUTDOOR_SIGHTSEEING',
    score(day) {
      const idx = dates.indexOf(day.date);
      return { value: values[idx]!, components: [] };
    },
  });

  it('computes bestDay by max score (earliest date wins ties)', () => {
    const scorer = constantScorer([10, 50, 70, 70, 30, 20, 10]);
    const rf = rank(scorer, week, () => makeCtx());
    expect(rf.bestDay.date).toBe('2026-07-30'); // first 70
    expect(rf.bestDay.score.value).toBe(70);
  });

  it('overallScore = round(mean of top-3 daily scores)', () => {
    const scorer = constantScorer([10, 20, 30, 40, 50, 60, 70]);
    const rf = rank(scorer, week, () => makeCtx());
    // top-3 = 70, 60, 50 → mean 60
    expect(rf.overallScore).toBe(60);
  });

  it('throws when week is not exactly 7 days', () => {
    const scorer = constantScorer([10, 20, 30, 40, 50, 60]);
    expect(() => rank(scorer, week.slice(0, 6), () => makeCtx())).toThrow(/expected 7/);
  });
});
