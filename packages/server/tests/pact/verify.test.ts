import type { AddressInfo } from 'node:net';
/**
 * Pact provider verification: boots the real Fastify+Apollo server in-process,
 * points the Pact Verifier at `packages/web/pacts/wa-web-wa-server.json`, and
 * fails the test if any consumer expectation isn't met.
 *
 * Runs in stub mode so provider state ("city Lisbon exists") is deterministic
 * without hitting Open-Meteo.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Verifier } from '@pact-foundation/pact';
import type { FastifyInstance } from 'fastify';
import { buildApollo, registerApollo } from '../../src/adapters/inbound/graphql/apollo.js';
import { buildContainer } from '../../src/composition-root.js';
import { loadEnv } from '../../src/infrastructure/env.js';
import { createFastify } from '../../src/infrastructure/fastify-factory.js';
import { createLogger } from '../../src/infrastructure/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pactFile = path.resolve(here, '../../../web/pacts/wa-web-wa-server.json');

describe('Pact provider verification', () => {
  let fastify: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    process.env['OPEN_METEO_MODE'] = 'stub';
    process.env['NODE_ENV'] = 'test';
    process.env['LOG_LEVEL'] = 'silent';
    const env = loadEnv();
    const logger = createLogger(env);
    const container = buildContainer(env, { logger });
    fastify = createFastify(env, logger);
    const apollo = buildApollo(fastify, env);
    await apollo.start();
    await registerApollo(fastify, apollo, container);
    await fastify.listen({ port: 0, host: '127.0.0.1' });
    const addr = fastify.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 20_000);

  afterAll(async () => {
    await fastify?.close();
  });

  it('verifies against wa-web consumer pact', async () => {
    const verifier = new Verifier({
      provider: 'wa-server',
      providerBaseUrl: baseUrl,
      pactUrls: [pactFile],
      logLevel: 'warn',
    });
    // Verifier throws on failure — reaching here means every interaction passed.
    // We also parse the JSON output to double-check `result: true`.
    const output = await verifier.verifyProvider();
    const parsed = JSON.parse(output) as { result: boolean; interactionResults: unknown[] };
    expect(parsed.result).toBe(true);
    expect(parsed.interactionResults.length).toBeGreaterThan(0);
  }, 60_000);
});
