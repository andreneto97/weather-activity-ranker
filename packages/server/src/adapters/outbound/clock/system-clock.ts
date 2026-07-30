import type { ClockPort } from '../../../ports/clock.port.js';

/** Real wall-clock. Injected everywhere via composition root; tests use FakeClock. */
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
