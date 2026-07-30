import type { Location } from './location.js';
import type { RankedForecast } from './ranked-forecast.js';

/**
 * Tagged union returned by the RankActivitiesForCity use case.
 * The GraphQL layer maps this 1-to-1 to `ActivityRankingsResult` schema union.
 *
 * See specs/01-domain-model.spec.md, specs/08-use-case.spec.md.
 */
export type RankingResult =
  | {
      readonly kind: 'Ok';
      readonly location: Location;
      readonly rankings: readonly RankedForecast[]; // sorted by overallScore desc
      readonly summary: string;
      readonly generatedAt: Date;
    }
  | { readonly kind: 'CityNotFound'; readonly query: string }
  | { readonly kind: 'AmbiguousLocation'; readonly candidates: readonly Location[] }
  | {
      readonly kind: 'UpstreamUnavailable';
      readonly provider: string;
      readonly cause?: string;
    };
