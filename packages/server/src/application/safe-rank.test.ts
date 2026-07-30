import { describe, expect, it, jest } from '@jest/globals';
import type { Logger } from 'pino';
import { makeWeek } from '../../tests/support/factories.js';
import { defaultScoringWeights } from '../config/scoring.config.js';
import type { DailyWeather } from '../domain/daily-weather.js';
import { ScorerRegistry } from '../domain/scoring/registry.js';
import type { ActivityScorer, ScoringContext } from '../domain/scoring/scorer.js';
import { createSkiScorer } from '../domain/scoring/ski-scorer.js';
import { safeRank } from './safe-rank.js';

const silentLogger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(),
} as unknown as Logger;

const ctx = (): ScoringContext => ({ weights: defaultScoringWeights });

describe('safeRank', () => {
  it('delegates to rank() on happy path', () => {
    const week: readonly DailyWeather[] = makeWeek({
      snowfallCm: 20,
      temperature: { minC: -8, maxC: -3 },
    });
    const scorer = createSkiScorer(defaultScoringWeights.ski);
    const rf = safeRank(scorer, week, ctx, silentLogger);
    expect(rf.activity).toBe('SKIING');
    expect(rf.dailyScores).toHaveLength(7);
    expect(rf.overallScore).toBeGreaterThan(0);
  });

  it('returns notApplicableRankedForecast + logs when scorer throws', () => {
    const errorLogger = { ...silentLogger, error: jest.fn() } as unknown as Logger;
    const throwingScorer: ActivityScorer = {
      activity: 'SKIING',
      score: () => {
        throw new Error('boom');
      },
    };
    const week = makeWeek();

    const rf = safeRank(throwingScorer, week, ctx, errorLogger);
    expect(rf.overallScore).toBe(0);
    expect(rf.dailyScores).toHaveLength(7);
    expect(rf.dailyScores.every((d) => d.score.value === 0)).toBe(true);
    expect(rf.dailyScores[0]!.score.components[0]!.label).toBe('Scoring failed');
    expect(errorLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ activity: 'SKIING' }),
      'scorer threw',
    );
  });

  it('propagates safely across the registry (one bad scorer does not break others)', () => {
    const good = createSkiScorer(defaultScoringWeights.ski);
    const bad: ActivityScorer = {
      activity: 'SURFING',
      score: () => {
        throw new Error('bad scorer');
      },
    };
    const registry = new ScorerRegistry().register(good).register(bad);
    const week = makeWeek({ snowfallCm: 20, temperature: { minC: -8, maxC: -3 } });

    const results = registry.all().map((s) => safeRank(s, week, ctx, silentLogger));
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.activity === 'SKIING')!.overallScore).toBeGreaterThan(0);
    expect(results.find((r) => r.activity === 'SURFING')!.overallScore).toBe(0);
  });
});
