import { randomUUID } from 'node:crypto';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import fastifyApollo, { fastifyApolloDrainPlugin } from '@as-integrations/fastify';
import { maxAliasesRule } from '@escape.tech/graphql-armor-max-aliases';
import { maxDepthRule } from '@escape.tech/graphql-armor-max-depth';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Container } from '../../../composition-root.js';
import type { ServerEnv } from '../../../infrastructure/env.js';
import { getRequestId } from '../../../infrastructure/request-context.js';
import type { Context } from './context.js';
import { schema } from './schema.js';

/**
 * Build the Apollo Server instance for a given Fastify server.
 * Registration + `.start()` happens in main.ts.
 *
 * Receives the validated `ServerEnv` explicitly rather than reading
 * `process.env` directly — the env schema already parses NODE_ENV and
 * transforms EXPOSE_INTROSPECTION into a boolean. Reading raw `process.env`
 * duplicates that parsing (and could drift from the schema's contract).
 *
 * See specs/04-graphql-schema.spec.md §Apollo Server 5 integration (Fastify).
 */
export function buildApollo(fastify: FastifyInstance, env: ServerEnv): ApolloServer<Context> {
  const isProd = env.NODE_ENV === 'production';
  return new ApolloServer<Context>({
    schema,
    // Prod: introspection off by default (opt-in via EXPOSE_INTROSPECTION).
    // Codegen doesn't need runtime introspection — it reads the checked-in SDL.
    introspection: isProd ? env.EXPOSE_INTROSPECTION : true,
    // DoS guards. `flattenFragments: true` counts semantic depth (the shape of
    // the executed selection tree) rather than the textual nesting including
    // fragment spreads — otherwise our fragment-heavy queries hit depth 13
    // just from `...ActivityRankingFields → ...DailyScoreFields → ...ScoreFields`
    // chains, even though the actual server work is 6 levels deep. Aliases
    // are hard-capped at 5 so alias-batched amplification (60× activityRankings
    // in one request → 60× Open-Meteo fanout) is rejected at parse time.
    validationRules: [maxDepthRule({ n: 10, flattenFragments: true }), maxAliasesRule({ n: 5 })],
    // In prod, filter `extensions` down to a fixed allowlist. Apollo Server 5
    // already scrubs stacktraces in prod, but library-thrown `GraphQLError`s
    // can carry arbitrary keys (Zod's parsed issue tree, upstream response
    // body slices, etc.) that we don't want on the wire. Dev keeps everything
    // for debuggability.
    formatError: (formattedError) => {
      if (!isProd) {
        return {
          ...formattedError,
          extensions: { ...formattedError.extensions, requestId: getRequestId() },
        };
      }
      const code = formattedError.extensions?.['code'];
      return {
        ...formattedError,
        extensions: {
          ...(code !== undefined ? { code } : {}),
          requestId: getRequestId(),
        },
      };
    },
    plugins: [
      fastifyApolloDrainPlugin(fastify),
      // Prod: no landing page. Apollo's default prod landing loads client-side
      // JS from `apollo-server-landing-page.cdn.apollographql.com`, which our
      // CSP (`script-src 'self'`) blocks — the page would render as a broken
      // shell. Introspection is off in prod anyway, so the landing page adds
      // no value; the SDL is checked into `packages/contracts/schema.graphql`
      // for anyone who needs it. Dev keeps the embedded explorer.
      isProd
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageLocalDefault({ embed: true }),
    ],
  });
}

/**
 * Register Apollo on a Fastify server. Must be called AFTER `apollo.start()`
 * so plugins are ready.
 */
export async function registerApollo(
  fastify: FastifyInstance,
  apollo: ApolloServer<Context>,
  container: Container,
): Promise<void> {
  await fastify.register(fastifyApollo(apollo), {
    path: '/graphql',
    context: async (request) => buildContext(request, container),
  });
}

/**
 * Per-request context factory. Attaches:
 *   - a pino child logger scoped by requestId (all logs from resolvers
 *     downstream can be filtered by this),
 *   - use case handles from the composition-root container.
 *
 * `requestId` is read from AsyncLocalStorage, which `requestContextPlugin`
 * already populated with the validated (regex-checked, non-array, size-capped)
 * value on the `onRequest` hook. Re-reading the raw header here would bypass
 * that hardening — see the plugin's `pickRequestId()` for the rules.
 * `randomUUID()` fallback covers the theoretical case where Apollo runs
 * outside the request lifecycle (e.g. subscriptions); today unreachable.
 */
export async function buildContext(
  _request: FastifyRequest,
  container: Container,
): Promise<Context> {
  const requestId = getRequestId() ?? randomUUID();
  const logger = container.logger.child({ requestId });
  return {
    logger,
    rankActivities: container.rankActivities,
    geocode: container.geocode,
    requestId,
  };
}
