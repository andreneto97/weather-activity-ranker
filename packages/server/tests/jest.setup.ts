import { afterEach } from '@jest/globals';
import { resetMockHttp } from './support/mock-http.js';

// Clean up undici MockAgent state between tests.
// Also fails the test if any interceptor was set up but not consumed
// (see mock-http.ts — `assertNoPendingInterceptors`).
afterEach(async () => {
  await resetMockHttp();
});
