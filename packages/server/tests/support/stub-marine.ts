import type { MarineDaily } from '../../src/domain/daily-weather.js';
import { NotApplicableError, UpstreamError } from '../../src/domain/errors.js';
import type { Location } from '../../src/domain/location.js';
import type { MarinePort } from '../../src/ports/marine.port.js';

/**
 * Programmable MarinePort. Locations without a stubbed week throw
 * NotApplicableError by default (mirrors the real adapter's behavior for
 * inland cities like Chamonix).
 */
export class StubMarine implements MarinePort {
  private readonly byLocationId = new Map<string, readonly MarineDaily[]>();
  private throwUpstream: string | null = null;

  set(locationId: string, week: readonly MarineDaily[]): this {
    if (week.length !== 7) {
      throw new Error(`StubMarine.set: expected 7 days, got ${week.length}`);
    }
    this.byLocationId.set(locationId, week);
    return this;
  }

  /** Make the next call for `locationId` throw UpstreamError (not NotApplicable). */
  throwOn(locationId: string): this {
    this.throwUpstream = locationId;
    return this;
  }

  async getDailyMarine(loc: Location, days: number): Promise<readonly MarineDaily[]> {
    if (this.throwUpstream === loc.id) {
      this.throwUpstream = null;
      throw new UpstreamError('open-meteo-marine', `stub failure for ${loc.id}`);
    }
    const week = this.byLocationId.get(loc.id);
    if (!week) {
      throw new NotApplicableError('No coastal data', 'open-meteo-marine');
    }
    return week.slice(0, days);
  }
}
