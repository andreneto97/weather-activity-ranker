import { MockAgent, setGlobalDispatcher } from 'undici';

/**
 * Fetch mocking via undici's MockAgent — the built-in Node 22 way to intercept
 * global fetch. Replaces nock (which only intercepts node:http, not fetch/undici).
 *
 * Usage inside a test:
 *
 *   const { pool } = mockHttp('https://api.open-meteo.com');
 *   pool.intercept({ path: '/v1/forecast', method: 'GET' }).reply(200, fixture);
 *
 * Call `resetMockHttp()` in afterEach to clear state (see tests/jest.setup.ts).
 */

let mockAgent: MockAgent | undefined;

function getAgent(): MockAgent {
  if (!mockAgent) {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  }
  return mockAgent;
}

export function mockHttp(origin: string): {
  pool: ReturnType<MockAgent['get']>;
} {
  return { pool: getAgent().get(origin) };
}

export async function resetMockHttp(): Promise<void> {
  if (!mockAgent) return;
  // Assert no pending interceptors left dangling (would mean a test set up a
  // response but the code never called it — usually indicates a bug in the test).
  try {
    mockAgent.assertNoPendingInterceptors();
  } finally {
    await mockAgent.close();
    mockAgent = undefined;
  }
}
