import { assertNever } from '../../../../domain/exhaustive.js';
import { builder } from '../builder.js';
import type { DomainErrorSource } from '../context.js';
import { LocationType } from './location.js';
import { ActivityRankingsType } from './ranking.js';

/**
 * Error codes exposed via GraphQL. Clients switch on these rather than parsing
 * the human-readable `message`.
 */
export const ERROR_CODES = {
  CityNotFound: 'CITY_NOT_FOUND',
  AmbiguousLocation: 'AMBIGUOUS_LOCATION',
  UpstreamUnavailable: 'UPSTREAM_UNAVAILABLE',
} as const;

/** Interface every domain error implements. */
export const DomainErrorInterface = builder
  .interfaceRef<DomainErrorSource>('DomainError')
  .implement({
    description: 'Common shape for all domain errors.',
    fields: (t) => ({
      message: t.string({ nullable: false, resolve: (source) => messageFor(source) }),
      code: t.string({ nullable: false, resolve: (source) => codeFor(source) }),
    }),
    resolveType: (source) => {
      switch (source.kind) {
        case 'CityNotFound':
          return 'CityNotFoundError';
        case 'AmbiguousLocation':
          return 'AmbiguousLocationError';
        case 'UpstreamUnavailable':
          return 'UpstreamUnavailableError';
        default:
          return assertNever(source);
      }
    },
  });

export const CityNotFoundErrorType = builder.objectType('CityNotFoundError', {
  interfaces: [DomainErrorInterface],
  isTypeOf: (source) => (source as DomainErrorSource).kind === 'CityNotFound',
  fields: (t) => ({
    query: t.exposeString('query', { nullable: false }),
  }),
});

export const AmbiguousLocationErrorType = builder.objectType('AmbiguousLocationError', {
  interfaces: [DomainErrorInterface],
  isTypeOf: (source) => (source as DomainErrorSource).kind === 'AmbiguousLocation',
  fields: (t) => ({
    candidates: t.field({
      type: [LocationType],
      description: 'Top 5 candidates sorted by population descending.',
      nullable: false,
      resolve: (source) => [...source.candidates],
    }),
  }),
});

export const UpstreamUnavailableErrorType = builder.objectType('UpstreamUnavailableError', {
  interfaces: [DomainErrorInterface],
  isTypeOf: (source) => (source as DomainErrorSource).kind === 'UpstreamUnavailable',
  fields: (t) => ({
    provider: t.exposeString('provider', {
      description: "e.g. 'open-meteo-forecast', 'open-meteo-geocoding'.",
      nullable: false,
    }),
  }),
});

/** Top-level union returned by `activityRankings`. */
export const ActivityRankingsResultType = builder.unionType('ActivityRankingsResult', {
  types: [
    ActivityRankingsType,
    CityNotFoundErrorType,
    AmbiguousLocationErrorType,
    UpstreamUnavailableErrorType,
  ],
  resolveType: (source) => {
    switch (source.kind) {
      case 'Ok':
        return 'ActivityRankings';
      case 'CityNotFound':
        return 'CityNotFoundError';
      case 'AmbiguousLocation':
        return 'AmbiguousLocationError';
      case 'UpstreamUnavailable':
        return 'UpstreamUnavailableError';
      default:
        return assertNever(source);
    }
  },
});

// ---------- helpers ----------

function messageFor(source: DomainErrorSource): string {
  switch (source.kind) {
    case 'CityNotFound':
      return `City not found: ${source.query}`;
    case 'AmbiguousLocation':
      return `Multiple locations match — please pick one of ${source.candidates.length} candidates.`;
    case 'UpstreamUnavailable':
      return `Upstream service unavailable: ${source.provider}`;
    default:
      return assertNever(source);
  }
}

function codeFor(source: DomainErrorSource): string {
  return ERROR_CODES[source.kind];
}
