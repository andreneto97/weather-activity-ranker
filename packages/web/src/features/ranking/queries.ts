import { graphql } from '@/gql';

/**
 * All GraphQL operations + fragments for the ranking feature.
 * Fragment masking (`getFragmentData` in codegen preset) means each component
 * spreads only the fragment it declared — refactor-safe.
 *
 * See specs/05-frontend-architecture.spec.md §Fragment strategy.
 */

// ---------- Fragments ----------

export const LocationFieldsFragment = graphql(`
  fragment LocationFields on Location {
    id
    name
    country
    admin1
    timezone
    latitude
    longitude
    population
  }
`);

export const ScoreFieldsFragment = graphql(`
  fragment ScoreFields on Score {
    value
    notApplicable
    notApplicableReason
    components {
      label
      value
      weight
    }
  }
`);

export const DailyScoreFieldsFragment = graphql(`
  fragment DailyScoreFields on DailyScore {
    date
    score {
      ...ScoreFields
    }
    weather {
      weatherCode
      tempMinC
      tempMaxC
      precipitationProbabilityMaxPct
      windMaxKmh
      cloudCoverPct
    }
  }
`);

export const ActivityRankingFieldsFragment = graphql(`
  fragment ActivityRankingFields on ActivityRanking {
    activity
    overallScore
    bestDay {
      ...DailyScoreFields
    }
    dailyScores {
      ...DailyScoreFields
    }
  }
`);

// ---------- Queries ----------

export const ActivityRankingsQuery = graphql(`
  query ActivityRankings($cityQuery: String, $locationId: ID) {
    activityRankings(cityQuery: $cityQuery, locationId: $locationId) {
      __typename
      ... on ActivityRankings {
        city {
          ...LocationFields
        }
        summary
        generatedAt
        rankings {
          ...ActivityRankingFields
        }
      }
      ... on CityNotFoundError {
        message
        code
        query
      }
      ... on AmbiguousLocationError {
        message
        code
        candidates {
          ...LocationFields
        }
      }
      ... on UpstreamUnavailableError {
        message
        code
        provider
      }
    }
  }
`);

export const GeocodeQuery = graphql(`
  query Geocode($query: String!, $limit: Int) {
    geocode(query: $query, limit: $limit) {
      ...LocationFields
    }
  }
`);
