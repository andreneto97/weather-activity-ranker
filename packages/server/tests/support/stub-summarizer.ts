import type { SummarizerInput, SummarizerPort } from '../../src/ports/summarizer.port.js';

/**
 * Deterministic SummarizerPort for tests.
 * By default returns a predictable string; can be given a custom template.
 * Never throws (matches the port contract).
 */
export class StubSummarizer implements SummarizerPort {
  private readonly calls: SummarizerInput[] = [];

  constructor(private readonly render: (input: SummarizerInput) => string = defaultRender) {}

  async summarize(input: SummarizerInput): Promise<string> {
    this.calls.push(input);
    return this.render(input);
  }

  callCount(): number {
    return this.calls.length;
  }

  lastCall(): SummarizerInput | undefined {
    return this.calls.at(-1);
  }
}

const defaultRender = (input: SummarizerInput): string =>
  `Summary for ${input.city.name} (${input.rankings.length} activities scored).`;
