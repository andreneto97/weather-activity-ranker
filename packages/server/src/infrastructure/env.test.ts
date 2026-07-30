import { describe, expect, it } from '@jest/globals';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('accepts an empty env and fills in every default', () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.CORS_ORIGIN).toBe('http://localhost:5173');
    expect(env.OPEN_METEO_MODE).toBe('live');
    expect(env.OPEN_METEO_TIMEOUT_MS).toBe(3000);
    expect(env.CACHE_TTL_WEATHER_MS).toBe(30 * 60_000);
    expect(env.RATE_LIMIT_MAX).toBe(60);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(env.EXPOSE_INTROSPECTION).toBe(false);
    expect(env.SUMMARIZER_DAILY_CAP).toBe(100);
    expect(env.CACHE_TTL_AQI_MS).toBe(30 * 60_000);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('parses numeric env vars from strings', () => {
    const env = loadEnv({ PORT: '5000', RATE_LIMIT_MAX: '10' });
    expect(env.PORT).toBe(5000);
    expect(env.RATE_LIMIT_MAX).toBe(10);
  });

  it('coerces EXPOSE_INTROSPECTION string to boolean', () => {
    expect(loadEnv({ EXPOSE_INTROSPECTION: 'true' }).EXPOSE_INTROSPECTION).toBe(true);
    expect(loadEnv({ EXPOSE_INTROSPECTION: 'false' }).EXPOSE_INTROSPECTION).toBe(false);
  });

  it('accepts a valid ANTHROPIC_API_KEY', () => {
    const env = loadEnv({ ANTHROPIC_API_KEY: 'sk-ant-abc' });
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-abc');
  });

  it('rejects an empty ANTHROPIC_API_KEY string (would silently break Claude adapter)', () => {
    expect(() => loadEnv({ ANTHROPIC_API_KEY: '' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects negative numeric values', () => {
    expect(() => loadEnv({ PORT: '-1' })).toThrow(/PORT/);
    expect(() => loadEnv({ RATE_LIMIT_MAX: '0' })).toThrow(/RATE_LIMIT_MAX/);
  });

  it('rejects non-numeric strings for numeric fields', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadEnv({ LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/);
  });

  it('rejects an unknown OPEN_METEO_MODE', () => {
    expect(() => loadEnv({ OPEN_METEO_MODE: 'mock' })).toThrow(/OPEN_METEO_MODE/);
  });

  describe('CORS_ORIGIN validation', () => {
    it('accepts a single absolute URL', () => {
      const env = loadEnv({ CORS_ORIGIN: 'https://weather-activity-ranker.fly.dev' });
      expect(env.CORS_ORIGIN).toBe('https://weather-activity-ranker.fly.dev');
    });

    it('accepts a comma-separated list of absolute URLs (dev + prod)', () => {
      const env = loadEnv({
        CORS_ORIGIN: 'http://localhost:5173,https://weather-activity-ranker.fly.dev',
      });
      expect(env.CORS_ORIGIN).toContain('localhost');
      expect(env.CORS_ORIGIN).toContain('fly.dev');
    });

    it('rejects wildcard "*" — misdeploy footgun', () => {
      expect(() => loadEnv({ CORS_ORIGIN: '*' })).toThrow(/CORS_ORIGIN/);
    });

    it('rejects wildcard "*" mixed with valid origins', () => {
      expect(() => loadEnv({ CORS_ORIGIN: 'http://localhost:5173,*' })).toThrow(/CORS_ORIGIN/);
    });

    it('rejects a relative path (not a valid origin)', () => {
      expect(() => loadEnv({ CORS_ORIGIN: '/graphql' })).toThrow(/CORS_ORIGIN/);
    });

    it('rejects an empty string', () => {
      expect(() => loadEnv({ CORS_ORIGIN: '' })).toThrow(/CORS_ORIGIN/);
    });

    it('rejects only commas / whitespace', () => {
      expect(() => loadEnv({ CORS_ORIGIN: ' , , ' })).toThrow(/CORS_ORIGIN/);
    });
  });
});
