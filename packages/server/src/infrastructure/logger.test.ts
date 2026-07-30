import { describe, expect, it } from '@jest/globals';
import { loadEnv } from './env.js';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  it('respects the LOG_LEVEL env', () => {
    const logger = createLogger(loadEnv({ LOG_LEVEL: 'warn', NODE_ENV: 'production' }));
    expect(logger.level).toBe('warn');
  });

  it('exposes service + env on base bindings', () => {
    const logger = createLogger(loadEnv({ NODE_ENV: 'production' }));
    // `bindings()` returns an object with index signature; use bracket access
    // to comply with noPropertyAccessFromIndexSignature.
    const bindings = logger.bindings();
    expect(bindings['service']).toBe('weather-activities');
    expect(bindings['env']).toBe('production');
  });

  it('creates child loggers that inherit level and base', () => {
    const parent = createLogger(loadEnv({ LOG_LEVEL: 'debug', NODE_ENV: 'production' }));
    const child = parent.child({ requestId: 'abc' });
    expect(child.level).toBe('debug');
    expect(child.bindings()['service']).toBe('weather-activities');
    expect(child.bindings()['requestId']).toBe('abc');
  });
});
