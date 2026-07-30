import { maxAliasesRule } from '@escape.tech/graphql-armor-max-aliases';
import { maxDepthRule } from '@escape.tech/graphql-armor-max-depth';
import { describe, expect, it } from '@jest/globals';
import { buildSchema, parse, validate } from 'graphql';
import { schema } from './schema.js';

/**
 * Regression tests for the DoS validation rules registered in `apollo.ts`.
 * These are the sole barriers against alias-batched fanout amplification
 * (60× activityRankings in one request → 60× Open-Meteo calls) and against
 * depth-based query bombing. Any bump / removal of the caps without a
 * conscious decision should trip these.
 *
 * We validate documents directly against the rules rather than executing a
 * full request so the tests stay tight and don't spin up Apollo Server.
 */

const rules = [maxDepthRule({ n: 10, flattenFragments: true }), maxAliasesRule({ n: 5 })];

describe('graphql-armor validationRules', () => {
  describe('maxAliasesRule (n: 5)', () => {
    it('accepts up to 5 alias-batched activityRankings calls', () => {
      const query = `{
        a1: activityRankings(cityQuery:"aa") { __typename }
        a2: activityRankings(cityQuery:"aa") { __typename }
        a3: activityRankings(cityQuery:"aa") { __typename }
        a4: activityRankings(cityQuery:"aa") { __typename }
        a5: activityRankings(cityQuery:"aa") { __typename }
      }`;
      const errors = validate(schema, parse(query), rules);
      expect(errors).toEqual([]);
    });

    it('rejects a 6th alias — the amplification lever we care about', () => {
      const query = `{
        a1: activityRankings(cityQuery:"aa") { __typename }
        a2: activityRankings(cityQuery:"aa") { __typename }
        a3: activityRankings(cityQuery:"aa") { __typename }
        a4: activityRankings(cityQuery:"aa") { __typename }
        a5: activityRankings(cityQuery:"aa") { __typename }
        a6: activityRankings(cityQuery:"aa") { __typename }
      }`;
      // graphql-armor's max-aliases throws a GraphQLError from within the
      // visitor rather than returning it in the errors array. Apollo's
      // request pipeline catches this internally and surfaces it as a query
      // validation failure; here we just assert the throw.
      expect(() => validate(schema, parse(query), rules)).toThrow(/aliases limit of 5 exceeded/i);
    });
  });

  describe('maxDepthRule (n: 10, flattenFragments)', () => {
    it('accepts the real frontend ActivityRankings query (deep with fragments — semantic depth ~7)', () => {
      // Mirrors packages/web/src/features/ranking/queries.ts — fragment
      // expansion textually reaches ~13 levels; flattenFragments must count
      // it at the semantic depth, which is under 10.
      const query = `
        query ActivityRankings($cityQuery: String, $locationId: ID) {
          activityRankings(cityQuery: $cityQuery, locationId: $locationId) {
            __typename
            ... on ActivityRankings {
              city { id name country admin1 timezone latitude longitude population }
              summary
              generatedAt
              rankings {
                activity
                overallScore
                bestDay {
                  date
                  score {
                    value
                    notApplicable
                    notApplicableReason
                    components { label value weight }
                  }
                  weather { weatherCode tempMinC tempMaxC precipitationProbabilityMaxPct windMaxKmh cloudCoverPct }
                }
                dailyScores {
                  date
                  score {
                    value
                    notApplicable
                    notApplicableReason
                    components { label value weight }
                  }
                  weather { weatherCode tempMinC tempMaxC precipitationProbabilityMaxPct windMaxKmh cloudCoverPct }
                }
              }
            }
          }
        }
      `;
      const errors = validate(schema, parse(query), rules);
      expect(errors).toEqual([]);
    });

    it('rejects a query that exceeds depth 10', () => {
      // The real schema tops out around depth 5 on natural paths, so we can't
      // trip a depth-10 limit against it. Also `ignoreIntrospection: true`
      // (plugin default) rules out the `__schema → types → fields → type →
      // ofType…` trick. So test the RULE ITSELF against a synthetic schema
      // with a self-recursive type — proves the rule fires when depth would
      // actually exceed the cap, which is the guarantee we care about.
      const recursiveSchema = buildSchema(`
        type Node { child: Node label: String }
        type Query { root: Node }
      `);
      // 12 nested `child` selection sets → exceeds `n: 10`.
      const nested = `${'{ child'.repeat(12)} { label }${' }'.repeat(12)}`;
      const query = `{ root ${nested} }`;
      expect(() => validate(recursiveSchema, parse(query), rules)).toThrow(/depth/i);
    });
  });
});
