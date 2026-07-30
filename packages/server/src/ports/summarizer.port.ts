import type { Location } from '../domain/location.js';
import type { RankedForecast } from '../domain/ranked-forecast.js';

/**
 * Input bundle for the week summary. Rankings arrive already sorted by
 * overallScore desc.
 */
export interface SummarizerInput {
  readonly city: Location;
  readonly rankings: readonly RankedForecast[];
  readonly generatedAt: Date;
}

/**
 * Produces a one-sentence natural-language week summary.
 *
 * Two implementations live in the adapters layer:
 *   - TemplateSummarizer: always safe, deterministic
 *   - ClaudeHaikuSummarizer: opt-in via ANTHROPIC_API_KEY, wraps template as
 *     fallback on any error, timeout, kill-switch hit, etc.
 *
 * **Contract: MUST NEVER throw.** Always returns a string, even on upstream
 * failure. The composition root wires the fallback chain; downstream code
 * treats the port as infallible.
 *
 * See specs/01-domain-model.spec.md §SummarizerPort.
 */
export interface SummarizerPort {
  summarize(input: SummarizerInput): Promise<string>;
}
