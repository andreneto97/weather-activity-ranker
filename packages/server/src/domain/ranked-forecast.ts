import type { ActivityKind } from './activity.js';
import type { DailyScore } from './scoring/scorer.js';

/**
 * A full week of scoring for one activity in one city.
 *
 * Invariants:
 *   - dailyScores.length === 7
 *   - bestDay is the max by score.value (ties broken by earliest date)
 *   - overallScore = round(mean of top-3 scores)
 *
 * See specs/01-domain-model.spec.md §Invariants.
 */
export interface RankedForecast {
  readonly activity: ActivityKind;
  readonly dailyScores: readonly DailyScore[];
  readonly bestDay: DailyScore;
  readonly overallScore: number;
}
