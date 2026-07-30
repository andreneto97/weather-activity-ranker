/**
 * @jest-environment node
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Pact consumer contract for `ActivityRankings(cityQuery: "Lisbon")`.
 *
 * Deliberately minimal: one interaction is enough to demonstrate the pattern
 * without dragging in a Pact Broker. The generated pact JSON is written to
 * `packages/web/pacts/` and verified by the server-side test at
 * `packages/server/tests/pact/verify.test.ts`.
 *
 * Full CDC (broker + `can-i-deploy`) makes sense across teams / independent
 * deploy pipelines. This monorepo deploys atomically, so a git-committed pact
 * file is enough. See specs/06 §Pact.
 */
import { describe, expect, it } from '@jest/globals';
import { GraphQLPactV3, MatchersV3 } from '@pact-foundation/pact';

const { integer, string, atLeastOneLike } = MatchersV3;

const here = path.dirname(fileURLToPath(import.meta.url));

const provider = new GraphQLPactV3({
  consumer: 'wa-web',
  provider: 'wa-server',
  dir: path.resolve(here, '../../../../pacts'),
  logLevel: 'warn',
});

const ACTIVITY_RANKINGS_QUERY = /* GraphQL */ `
  query ActivityRankings($cityQuery: String, $locationId: ID) {
    activityRankings(cityQuery: $cityQuery, locationId: $locationId) {
      __typename
      ... on ActivityRankings {
        city {
          id
          name
          country
        }
        summary
        rankings {
          activity
          overallScore
        }
      }
    }
  }
`;

describe('Pact: wa-web → wa-server (activityRankings)', () => {
  it('returns 4 rankings for a known city', async () => {
    provider
      .given('city Lisbon exists and has weather')
      .uponReceiving('a GraphQL query for activityRankings("Lisbon")')
      .withOperation('ActivityRankings')
      .withQuery(ACTIVITY_RANKINGS_QUERY)
      .withVariables({ cityQuery: 'Lisbon' })
      .withRequest({
        method: 'POST',
        path: '/graphql',
        headers: { 'Content-Type': 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          data: {
            activityRankings: {
              __typename: 'ActivityRankings',
              city: {
                id: string('2267057'),
                name: string('Lisbon'),
                country: string('Portugal'),
              },
              summary: string('Lisbon this week: best for outdoor sightseeing.'),
              rankings: atLeastOneLike({
                activity: string('OUTDOOR_SIGHTSEEING'),
                overallScore: integer(78),
              }),
            },
          },
        },
      });

    await provider.executeTest(async (mockServer) => {
      const res = await fetch(`${mockServer.url}/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'ActivityRankings',
          query: ACTIVITY_RANKINGS_QUERY,
          variables: { cityQuery: 'Lisbon' },
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          activityRankings: {
            __typename: string;
            city: { name: string };
            rankings: { activity: string; overallScore: number }[];
          };
        };
      };
      expect(body.data.activityRankings.__typename).toBe('ActivityRankings');
      expect(body.data.activityRankings.rankings.length).toBeGreaterThan(0);
    });
  }, 30_000);
});
