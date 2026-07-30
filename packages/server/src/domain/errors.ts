/**
 * Domain / infrastructure errors. Adapters throw these; use case catches specific
 * classes to decide between fatal (`UpstreamError` → UpstreamUnavailable) and
 * per-activity degradation (`NotApplicableError` → skip that scorer, degrade
 * the day's ranking).
 *
 * Both extend `Error` directly (not each other) so `err instanceof
 * UpstreamError` cannot misclassify a NotApplicable as a fatal upstream
 * failure. If a shared interface is ever useful, add one — don't reintroduce
 * the inheritance shortcut.
 *
 * See specs/01-domain-model.spec.md §Domain-level errors,
 *     specs/08-use-case.spec.md §Error → Result mapping.
 */
export class UpstreamError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * Thrown by Marine / AirQuality adapters when the coordinates or region
 * aren't supported (e.g. surfing inland). The use case catches this to skip
 * the affected activity's data (produces notApplicableScore) rather than
 * failing the whole request. **Not** an `UpstreamError` — those are
 * network/schema/5xx failures that a retry loop might resolve; a NotApplicable
 * is a stable "this data source doesn't apply here" signal.
 */
export class NotApplicableError extends Error {
  constructor(
    public readonly reason: string,
    public readonly provider: string,
  ) {
    super(reason);
    this.name = 'NotApplicableError';
  }
}
