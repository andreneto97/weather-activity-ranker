import type { Logger } from 'pino';
import type { ClockPort } from '../../../ports/clock.port.js';
import type { SummarizerInput, SummarizerPort } from '../../../ports/summarizer.port.js';
import { activityLabel } from './activity-label.js';

/**
 * Claude Haiku summarizer with defence in depth:
 *
 *   - **Fallback**: any error / timeout / cap hit falls back to the injected
 *     `SummarizerPort` (typically TemplateSummarizer). Port contract says
 *     summarize NEVER throws.
 *   - **Daily kill switch**: `SUMMARIZER_DAILY_CAP` (default 100) API calls
 *     per UTC day. When exceeded, all further calls go to the fallback until
 *     midnight UTC.
 *   - **Model**: claude-haiku-4-5 (smallest, cheapest, ~200ms responses).
 *   - **max_tokens: 100** — the summary is one sentence.
 *   - **Timeout: 3s** — a slow AI shouldn't slow the whole request.
 *   - **Prompt caching**: system prompt marked cacheable (Anthropic feature)
 *     to reduce cost on repeated calls. Requires ≥ 1024 system-prompt tokens
 *     for the cache write; ours is much smaller so caching is a no-op — kept
 *     as a nudge for when we scale the prompt.
 *
 * See specs/01-domain-model.spec.md §SummarizerPort implementation constraints.
 */

// Structural interface — matches the shape we need from @anthropic-ai/sdk's Client,
// without pinning to the SDK's Client type (which is complex to import in tests).
export interface AnthropicClient {
  messages: {
    create(params: AnthropicCreateParams): Promise<AnthropicResponse>;
  };
}

interface AnthropicCreateParams {
  model: string;
  max_tokens: number;
  system: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
  messages: Array<{ role: 'user'; content: string }>;
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
}

export interface ClaudeHaikuDeps {
  readonly client: AnthropicClient;
  readonly fallback: SummarizerPort;
  readonly dailyCap: number;
  readonly clock: ClockPort;
  readonly logger: Logger;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 100;
const SYSTEM_PROMPT =
  'You are a concise travel weather assistant. Given a city and per-activity ranking scores for the next 7 days, write ONE sentence highlighting the best day/activity and any noteworthy warning. No emojis, no lists, no headers.';

export class ClaudeHaikuSummarizer implements SummarizerPort {
  private callsToday = 0;
  private counterDay: string | null = null;

  constructor(private readonly deps: ClaudeHaikuDeps) {}

  async summarize(input: SummarizerInput): Promise<string> {
    const utcDay = this.deps.clock.now().toISOString().slice(0, 10);
    if (utcDay !== this.counterDay) {
      this.counterDay = utcDay;
      this.callsToday = 0;
    }

    if (this.callsToday >= this.deps.dailyCap) {
      this.deps.logger.info(
        { cap: this.deps.dailyCap, callsToday: this.callsToday },
        'claude-haiku daily cap reached; falling back to template',
      );
      return this.safeFallback(input);
    }

    try {
      const summary = await this.callClaude(input);
      this.callsToday++;
      this.deps.logger.debug(
        { callsToday: this.callsToday, city: input.city.name },
        'claude-haiku summary generated',
      );
      return summary;
    } catch (err) {
      this.deps.logger.warn(
        { err, city: input.city.name },
        'claude-haiku failed; falling back to template',
      );
      return this.safeFallback(input);
    }
  }

  /**
   * Belt-and-braces around the fallback: `SummarizerPort.summarize` is
   * contractually "never throws," but a bug or transient issue inside the
   * template summarizer would otherwise take down the whole GraphQL request.
   * On failure we log and return a minimal literal so the resolver always
   * gets a string back.
   */
  private async safeFallback(input: SummarizerInput): Promise<string> {
    try {
      return await this.deps.fallback.summarize(input);
    } catch (err) {
      this.deps.logger.error(
        { err, city: input.city.name },
        'fallback summarizer threw (contract violation); returning static text',
      );
      return `Weather forecast for ${input.city.name}.`;
    }
  }

  private async callClaude(input: SummarizerInput): Promise<string> {
    const timeoutMs = this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const promise = this.deps.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(input),
        },
      ],
    });

    const response = await withTimeout(promise, timeoutMs);
    const textBlock = response.content.find((c) => c.type === 'text');
    const text = textBlock?.text?.trim() ?? '';
    if (!text) throw new Error('Empty response from Claude');
    return text;
  }
}

function buildUserPrompt(input: SummarizerInput): string {
  const rankingsList = input.rankings
    .map(
      (r) =>
        `- ${activityLabel(r.activity)}: overall ${r.overallScore}/100, best day ${r.bestDay.date} (${r.bestDay.score.value}/100)`,
    )
    .join('\n');
  return `City: ${input.city.name}, ${input.city.country}
Timezone: ${input.city.timezone}
Rankings (sorted best first):
${rankingsList}

Write one sentence for a traveller planning this week.`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Claude timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
