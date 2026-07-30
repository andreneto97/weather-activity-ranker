import type { ActivityKind } from '../activity.js';
import type { ActivityScorer } from './scorer.js';

/**
 * Thrown by ScorerRegistry.get when the requested activity has no registered scorer.
 * This is a programmer error (unreachable if the registry is populated correctly),
 * not a domain error.
 */
export class UnknownScorerError extends Error {
  constructor(kind: ActivityKind) {
    super(`No scorer registered for activity: ${kind}`);
    this.name = 'UnknownScorerError';
  }
}

/**
 * Registry of ActivityScorer implementations, one per ActivityKind.
 * Fluent registration API — used from composition-root.ts.
 *
 * See specs/02-scoring.spec.md §Registry.
 */
export class ScorerRegistry {
  private readonly scorers = new Map<ActivityKind, ActivityScorer>();

  register(scorer: ActivityScorer): this {
    this.scorers.set(scorer.activity, scorer);
    return this;
  }

  all(): readonly ActivityScorer[] {
    return [...this.scorers.values()];
  }

  get(activity: ActivityKind): ActivityScorer {
    const s = this.scorers.get(activity);
    if (!s) throw new UnknownScorerError(activity);
    return s;
  }
}
