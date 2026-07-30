import type { Logger } from 'pino';
import type { GeocodeUseCase } from '../../../application/geocode.usecase.js';
import type { RankActivitiesUseCase } from '../../../application/rank-activities.usecase.js';
import type { RankingResult } from '../../../domain/ranking-result.js';

/**
 * Per-request context passed to every resolver via Apollo.
 * See specs/04-graphql-schema.spec.md §Pothos wiring.
 */
export interface Context {
  readonly logger: Logger;
  readonly rankActivities: RankActivitiesUseCase;
  readonly geocode: GeocodeUseCase;
  readonly requestId: string;
}

/**
 * Backing type for the DomainError interface.
 * Pothos discriminates on `kind` via the interface's `resolveType`.
 */
export type DomainErrorSource = Extract<
  RankingResult,
  { kind: 'CityNotFound' | 'AmbiguousLocation' | 'UpstreamUnavailable' }
>;
