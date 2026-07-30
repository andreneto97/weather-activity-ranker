import type { Logger } from 'pino';
import type { DailyWeather } from '../domain/daily-weather.js';
import type { RankedForecast } from '../domain/ranked-forecast.js';
import type { ActivityScorer, ScoringContext } from '../domain/scoring/scorer.js';
import { notApplicableRankedForecast, rank } from '../domain/scoring/util.js';

/**
 * Wrap `rank()` in a try/catch so a scorer bug never bubbles up and kills
 * the whole response. On throw, logs and returns notApplicableRankedForecast.
 *
 * Lives in `application/` (not `domain/`) because it depends on pino's Logger,
 * which is infrastructure. Domain stays pure.
 *
 * Note: scorers themselves already return notApplicableScore for legitimate
 * "not applicable" cases (surfing without marine data). safeRank only catches
 * *unexpected* exceptions.
 *
 * See specs/02-scoring.spec.md §Utilities and specs/08-use-case.spec.md
 * §safeRank helper.
 */
export function safeRank(
  scorer: ActivityScorer,
  week: readonly DailyWeather[],
  ctx: (day: DailyWeather) => ScoringContext,
  logger: Logger,
): RankedForecast {
  try {
    return rank(scorer, week, ctx);
  } catch (err) {
    logger.error({ err, activity: scorer.activity }, 'scorer threw');
    return notApplicableRankedForecast(
      scorer.activity,
      week.map((d) => d.date),
      'Scoring failed',
    );
  }
}
