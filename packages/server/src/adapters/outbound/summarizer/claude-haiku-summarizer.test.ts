import { describe, expect, it, jest } from '@jest/globals';
import type { Logger } from 'pino';
import { makeLocation } from '../../../../tests/support/factories.js';
import { FakeClock } from '../../../../tests/support/fake-clock.js';
import { StubSummarizer } from '../../../../tests/support/stub-summarizer.js';
import type { RankedForecast } from '../../../domain/ranked-forecast.js';
import {
  type AnthropicClient,
  type ClaudeHaikuDeps,
  ClaudeHaikuSummarizer,
} from './claude-haiku-summarizer.js';

const silentLogger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(),
} as unknown as Logger;

const okRanking: RankedForecast = {
  activity: 'OUTDOOR_SIGHTSEEING',
  dailyScores: [],
  bestDay: { date: '2026-07-29', score: { value: 85, components: [] } },
  overallScore: 85,
};

const input = () => ({
  city: makeLocation(),
  rankings: [okRanking],
  generatedAt: new Date('2026-07-28T12:00:00Z'),
});

const makeClient = (impl: AnthropicClient['messages']['create']): AnthropicClient => ({
  messages: { create: impl },
});

const buildSummarizer = (
  overrides: Partial<ClaudeHaikuDeps>,
): { summarizer: ClaudeHaikuSummarizer; fallback: StubSummarizer } => {
  const fallback = new StubSummarizer(() => 'FALLBACK');
  const summarizer = new ClaudeHaikuSummarizer({
    client: makeClient(async () => ({ content: [{ type: 'text', text: 'AI OK' }] })),
    fallback,
    dailyCap: 500,
    clock: new FakeClock('2026-07-28T12:00:00Z'),
    logger: silentLogger,
    ...overrides,
  });
  return { summarizer, fallback };
};

describe('ClaudeHaikuSummarizer', () => {
  it('returns Claude response on happy path', async () => {
    const { summarizer } = buildSummarizer({});
    const out = await summarizer.summarize(input());
    expect(out).toBe('AI OK');
  });

  it('falls back to template on API error', async () => {
    const { summarizer, fallback } = buildSummarizer({
      client: makeClient(async () => {
        throw new Error('boom');
      }),
    });
    const out = await summarizer.summarize(input());
    expect(out).toBe('FALLBACK');
    expect(fallback.callCount()).toBe(1);
  });

  it('falls back to template on empty response', async () => {
    const { summarizer } = buildSummarizer({
      client: makeClient(async () => ({ content: [] })),
    });
    const out = await summarizer.summarize(input());
    expect(out).toBe('FALLBACK');
  });

  it('falls back to template on whitespace-only response', async () => {
    const { summarizer } = buildSummarizer({
      client: makeClient(async () => ({ content: [{ type: 'text', text: '   ' }] })),
    });
    const out = await summarizer.summarize(input());
    expect(out).toBe('FALLBACK');
  });

  it('falls back to template on timeout', async () => {
    const { summarizer } = buildSummarizer({
      timeoutMs: 5,
      client: makeClient(
        () => new Promise((resolve) => setTimeout(() => resolve({ content: [] }), 1000)),
      ),
    });
    const out = await summarizer.summarize(input());
    expect(out).toBe('FALLBACK');
  });

  describe('kill switch (daily cap)', () => {
    it('falls back to template once daily cap is exceeded', async () => {
      const { summarizer, fallback } = buildSummarizer({ dailyCap: 2 });
      await summarizer.summarize(input());
      await summarizer.summarize(input());
      // Third call — cap hit, fallback.
      const out = await summarizer.summarize(input());
      expect(out).toBe('FALLBACK');
      expect(fallback.callCount()).toBe(1);
    });

    it('resets counter at UTC midnight', async () => {
      const clock = new FakeClock('2026-07-28T23:59:00Z');
      const { summarizer, fallback } = buildSummarizer({ dailyCap: 1, clock });

      await summarizer.summarize(input()); // 1st call, counter=1
      await summarizer.summarize(input()); // 2nd call, cap hit → fallback
      expect(fallback.callCount()).toBe(1);

      // Advance past UTC midnight
      clock.advance(2 * 60 * 1000);
      await summarizer.summarize(input()); // counter reset → AI hit
      expect(fallback.callCount()).toBe(1); // fallback not called again
    });

    it('does NOT increment call counter on error (protects budget)', async () => {
      let callCount = 0;
      const { summarizer } = buildSummarizer({
        dailyCap: 3,
        client: makeClient(async () => {
          callCount++;
          if (callCount === 1) throw new Error('transient');
          return { content: [{ type: 'text', text: 'AI OK' }] };
        }),
      });

      await summarizer.summarize(input()); // errors → fallback, not counted
      await summarizer.summarize(input()); // succeeds, counted (1)
      await summarizer.summarize(input()); // succeeds, counted (2)
      const out = await summarizer.summarize(input()); // succeeds, counted (3)
      expect(out).toBe('AI OK');
      // Cap was 3, all three successful calls fit even though we made 4 attempts.
    });
  });

  it('never throws even when the fallback itself violates its own contract', async () => {
    const { summarizer } = buildSummarizer({
      client: makeClient(async () => {
        throw new Error('boom');
      }),
      // Fallback ALSO instrumented to throw — belt-and-braces `safeFallback`
      // must catch and return a minimal literal instead of propagating.
      fallback: {
        async summarize() {
          throw new Error('fallback broken too');
        },
      },
    });

    const out = await summarizer.summarize(input());
    expect(out).toBe(`Weather forecast for ${input().city.name}.`);
  });
});
