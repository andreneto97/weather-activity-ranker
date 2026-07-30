import { builder } from '../builder.js';
import { ActivityKindEnum } from './activity.js';
import { LocationType } from './location.js';
import { DailyScoreType } from './score.js';

/** One activity's 7-day scoring for one city. */
export const ActivityRankingType = builder.objectType('ActivityRanking', {
  description: '7-day scoring for one activity in one city.',
  fields: (t) => ({
    activity: t.field({
      type: ActivityKindEnum,
      nullable: false,
      resolve: (r) => r.activity,
    }),
    dailyScores: t.field({
      type: [DailyScoreType],
      nullable: false,
      resolve: (r) => [...r.dailyScores],
    }),
    bestDay: t.field({
      type: DailyScoreType,
      nullable: false,
      resolve: (r) => r.bestDay,
    }),
    overallScore: t.int({
      description: '0..100, mean of the top-3 daily scores.',
      nullable: false,
      resolve: (r) => r.overallScore,
    }),
  }),
});

/** Success payload of `activityRankings` query. */
export const ActivityRankingsType = builder.objectType('ActivityRankings', {
  description: 'Success shape for the top-level query.',
  fields: (t) => ({
    city: t.field({
      type: LocationType,
      nullable: false,
      resolve: (r) => r.location,
    }),
    rankings: t.field({
      type: [ActivityRankingType],
      description: 'Sorted by overallScore descending.',
      nullable: false,
      resolve: (r) => [...r.rankings],
    }),
    summary: t.exposeString('summary', {
      description: 'Human-readable summary, either template or Claude-generated.',
      nullable: false,
    }),
    generatedAt: t.string({
      description: 'ISO 8601 timestamp.',
      nullable: false,
      resolve: (r) => r.generatedAt.toISOString(),
    }),
  }),
});
