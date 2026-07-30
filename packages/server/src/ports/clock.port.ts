/**
 * Wall-clock abstraction. Exists so `generatedAt` and any time-based logic
 * can be tested without stubbing global Date. Adapter (SystemClock) returns
 * `new Date()`; FakeClock (in tests/support) returns a fixed value.
 *
 * See specs/01-domain-model.spec.md §Ports.
 */
export interface ClockPort {
  now(): Date;
}
