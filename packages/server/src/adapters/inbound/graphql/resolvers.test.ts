import { describe, expect, it, jest } from '@jest/globals';
import { graphql } from 'graphql';
import type { Logger } from 'pino';
import { makeLocation } from '../../../../tests/support/factories.js';
import type { GeocodeUseCase } from '../../../application/geocode.usecase.js';
import type { RankActivitiesUseCase } from '../../../application/rank-activities.usecase.js';
import type { RankingResult } from '../../../domain/ranking-result.js';
import type { Context } from './context.js';
import { schema } from './schema.js';

const silentLogger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(),
} as unknown as Logger;

// Helper: execute a query against the real schema with a stubbed use case.
const exec = async (
  query: string,
  variables: Record<string, unknown> | undefined,
  ctx: Context,
) => {
  const result = await graphql({
    schema,
    source: query,
    variableValues: variables,
    contextValue: ctx,
  });
  return result;
};

const buildCtx = (overrides: Partial<Context>): Context => ({
  logger: silentLogger,
  requestId: 'test-req-1',
  rankActivities: {
    execute: async () => {
      throw new Error('not stubbed');
    },
  },
  geocode: {
    execute: async () => [],
  },
  ...overrides,
});

describe('GraphQL resolvers — activityRankings', () => {
  const QUERY = /* GraphQL */ `
    query Q($cityQuery: String, $locationId: ID) {
      activityRankings(cityQuery: $cityQuery, locationId: $locationId) {
        __typename
        ... on ActivityRankings {
          city { id name }
          summary
          rankings { activity overallScore }
        }
        ... on DomainError { message code }
        ... on CityNotFoundError { query }
        ... on AmbiguousLocationError { candidates { id name } }
        ... on UpstreamUnavailableError { provider }
      }
    }
  `;

  it('happy path — resolves ActivityRankings with sorted rankings', async () => {
    const okResult: RankingResult = {
      kind: 'Ok',
      location: makeLocation(),
      summary: 'Lovely week in Lisbon.',
      generatedAt: new Date('2026-07-28T12:00:00Z'),
      rankings: [
        {
          activity: 'OUTDOOR_SIGHTSEEING',
          overallScore: 85,
          bestDay: { date: '2026-07-29', score: { value: 90, components: [] } },
          dailyScores: [],
        },
        {
          activity: 'SKIING',
          overallScore: 5,
          bestDay: { date: '2026-07-28', score: { value: 5, components: [] } },
          dailyScores: [],
        },
      ],
    };
    const result = await exec(
      QUERY,
      { cityQuery: 'Lisbon' },
      buildCtx({
        rankActivities: { execute: async () => okResult } as RankActivitiesUseCase,
      }),
    );
    expect(result.errors).toBeUndefined();
    const data = result.data?.['activityRankings'] as Record<string, unknown>;
    expect(data['__typename']).toBe('ActivityRankings');
    expect(data['summary']).toBe('Lovely week in Lisbon.');
    expect((data['rankings'] as Array<{ activity: string }>).map((r) => r.activity)).toEqual([
      'OUTDOOR_SIGHTSEEING',
      'SKIING',
    ]);
  });

  it('CityNotFoundError — surfaces via the union with code + message', async () => {
    const result = await exec(
      QUERY,
      { cityQuery: 'nowhere-city' },
      buildCtx({
        rankActivities: {
          execute: async () => ({ kind: 'CityNotFound', query: 'nowhere-city' }),
        } as RankActivitiesUseCase,
      }),
    );
    expect(result.errors).toBeUndefined();
    const data = result.data?.['activityRankings'] as Record<string, unknown>;
    expect(data['__typename']).toBe('CityNotFoundError');
    expect(data['code']).toBe('CITY_NOT_FOUND');
    expect(data['query']).toBe('nowhere-city');
    expect(String(data['message'])).toContain('nowhere-city');
  });

  it('AmbiguousLocationError — includes candidate list', async () => {
    const candidates = [
      makeLocation({ id: 'sp-mo', name: 'Springfield', admin1: 'Missouri' }),
      makeLocation({ id: 'sp-il', name: 'Springfield', admin1: 'Illinois' }),
    ];
    const result = await exec(
      QUERY,
      { cityQuery: 'Springfield' },
      buildCtx({
        rankActivities: {
          execute: async () => ({ kind: 'AmbiguousLocation', candidates }),
        } as RankActivitiesUseCase,
      }),
    );
    const data = result.data?.['activityRankings'] as Record<string, unknown>;
    expect(data['__typename']).toBe('AmbiguousLocationError');
    expect(data['code']).toBe('AMBIGUOUS_LOCATION');
    expect(data['candidates']).toHaveLength(2);
  });

  it('UpstreamUnavailableError — exposes provider', async () => {
    const result = await exec(
      QUERY,
      { cityQuery: 'anything' },
      buildCtx({
        rankActivities: {
          execute: async () => ({ kind: 'UpstreamUnavailable', provider: 'open-meteo-forecast' }),
        } as RankActivitiesUseCase,
      }),
    );
    const data = result.data?.['activityRankings'] as Record<string, unknown>;
    expect(data['__typename']).toBe('UpstreamUnavailableError');
    expect(data['provider']).toBe('open-meteo-forecast');
  });

  it('rejects BAD_USER_INPUT when neither cityQuery nor locationId provided', async () => {
    const result = await exec(QUERY, {}, buildCtx({}));
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.extensions?.['code']).toBe('BAD_USER_INPUT');
  });

  it('rejects BAD_USER_INPUT when cityQuery < 2 chars', async () => {
    const result = await exec(QUERY, { cityQuery: 'a' }, buildCtx({}));
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.extensions?.['code']).toBe('BAD_USER_INPUT');
  });
});

describe('GraphQL resolvers — geocode', () => {
  const QUERY = /* GraphQL */ `
    query G($query: String!, $limit: Int) {
      geocode(query: $query, limit: $limit) {
        id name country
      }
    }
  `;

  it('returns matching locations', async () => {
    const lisbon = makeLocation();
    const result = await exec(
      QUERY,
      { query: 'lisbon' },
      buildCtx({
        geocode: { execute: async () => [lisbon] } as GeocodeUseCase,
      }),
    );
    expect(result.errors).toBeUndefined();
    expect(result.data?.['geocode']).toEqual([
      { id: 'geo-lisbon', name: 'Lisbon', country: 'Portugal' },
    ]);
  });

  it('rejects query < 2 chars', async () => {
    const result = await exec(QUERY, { query: 'a' }, buildCtx({}));
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]?.extensions?.['code']).toBe('BAD_USER_INPUT');
  });
});
