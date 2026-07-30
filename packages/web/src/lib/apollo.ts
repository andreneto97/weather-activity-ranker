import { ApolloClient, InMemoryCache } from '@apollo/client';
import { env } from './env.js';

/**
 * Apollo Client factory. Same-origin `/graphql` by default (works in prod
 * on Fly.io single-container; in dev Vite proxies to localhost:4000).
 *
 * Cache design:
 *   - `Location.id` is stable → normalize by it.
 *   - `ActivityRankings` isn't a stable entity across time (weather
 *     changes) so we key the query by args (cityQuery / locationId).
 *   - `errorPolicy` stays at default ('none'): union payloads arrive as
 *     data, HTTP failures throw and hit the ErrorBoundary. See spec 05.
 */
export function createApolloClient(): ApolloClient<unknown> {
  return new ApolloClient({
    uri: env.VITE_GRAPHQL_ENDPOINT ?? '/graphql',
    cache: new InMemoryCache({
      typePolicies: {
        Location: { keyFields: ['id'] },
        Query: {
          fields: {
            activityRankings: {
              keyArgs: ['cityQuery', 'locationId'],
            },
            geocode: {
              keyArgs: ['query', 'limit'],
            },
          },
        },
      },
    }),
  });
}
