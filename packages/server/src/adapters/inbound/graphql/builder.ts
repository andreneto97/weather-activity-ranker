import SchemaBuilder from '@pothos/core';
import type { DailyWeather } from '../../../domain/daily-weather.js';
import type { Location } from '../../../domain/location.js';
import type { RankedForecast } from '../../../domain/ranked-forecast.js';
import type { RankingResult } from '../../../domain/ranking-result.js';
import type { DailyScore, Score, ScoreComponent } from '../../../domain/scoring/scorer.js';
import type { Context, DomainErrorSource } from './context.js';

/**
 * Central Pothos SchemaBuilder. Object type sources listed here so that
 * `builder.objectType('Foo', {...})` calls elsewhere are strongly typed.
 *
 * See specs/04-graphql-schema.spec.md §Pothos wiring.
 */
export const builder = new SchemaBuilder<{
  Context: Context;
  Interfaces: { DomainError: DomainErrorSource };
  Objects: {
    Location: Location;
    ScoreComponent: ScoreComponent;
    Score: Score;
    DailyScore: DailyScore;
    DayWeather: DailyWeather;
    ActivityRanking: RankedForecast;
    ActivityRankings: Extract<RankingResult, { kind: 'Ok' }>;
    CityNotFoundError: Extract<RankingResult, { kind: 'CityNotFound' }>;
    AmbiguousLocationError: Extract<RankingResult, { kind: 'AmbiguousLocation' }>;
    UpstreamUnavailableError: Extract<RankingResult, { kind: 'UpstreamUnavailable' }>;
  };
  Scalars: {
    ID: { Input: string; Output: string };
  };
}>({});

builder.queryType({});
