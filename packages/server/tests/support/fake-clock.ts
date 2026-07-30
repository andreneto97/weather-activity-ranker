import type { ClockPort } from '../../src/ports/clock.port.js';

/**
 * Deterministic clock for tests. Frozen at construction time.
 * `advance(ms)` bumps the internal timestamp forward.
 */
export class FakeClock implements ClockPort {
  private current: Date;

  constructor(iso: string | Date = '2026-07-28T12:00:00Z') {
    this.current = iso instanceof Date ? new Date(iso) : new Date(iso);
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
