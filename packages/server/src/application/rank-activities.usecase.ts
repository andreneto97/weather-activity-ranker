import type { Logger } from 'pino';
import type { AirQualityDaily, DailyWeather, MarineDaily } from '../domain/daily-weather.js';
import { NotApplicableError, UpstreamError } from '../domain/errors.js';
import type { Location } from '../domain/location.js';
import type { RankedForecast } from '../domain/ranked-forecast.js';
import type { RankingResult } from '../domain/ranking-result.js';
import type { ScorerRegistry } from '../domain/scoring/registry.js';
import type { ScoringContext } from '../domain/scoring/scorer.js';
import type { ScoringWeights } from '../domain/scoring/weights.js';
import type { AirQualityPort } from '../ports/air-quality.port.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { GeocodingPort } from '../ports/geocoding.port.js';
import type { MarinePort } from '../ports/marine.port.js';
import type { SummarizerPort } from '../ports/summarizer.port.js';
import type { WeatherPort } from '../ports/weather.port.js';
import { safeRank } from './safe-rank.js';

/**
 * Orchestrates the full ranking flow:
 *   geocode → forecast (fatal) → marine/AQI (advisory) → score all activities
 *   → sort by overallScore → summarize → return Ok result.
 *
 * Domain-level errors (CityNotFound, AmbiguousLocation, UpstreamUnavailable)
 * are returned as tagged-union variants, not thrown. GraphQL adapter maps 1:1.
 *
 * See specs/08-use-case.spec.md — this file mirrors the flow diagram there.
 */

export interface RankActivitiesInput {
  readonly cityQuery?: string;
  readonly locationId?: string;
}

export interface RankActivitiesUseCase {
  /**
   * Runs the ranking flow. Accepts an optional per-call logger so the
   * resolver can pass in a child logger already scoped by `requestId`;
   * without it, falls back to the composition-root root logger (fine for
   * boot-time pre-warm calls that don't have a request).
   */
  execute(input: RankActivitiesInput, opts?: { readonly logger?: Logger }): Promise<RankingResult>;
}

export interface RankActivitiesDeps {
  readonly geocoding: GeocodingPort;
  readonly weather: WeatherPort;
  readonly marine: MarinePort;
  readonly airQuality: AirQualityPort;
  readonly scorers: ScorerRegistry;
  readonly summarizer: SummarizerPort;
  readonly clock: ClockPort;
  readonly logger: Logger;
  readonly weights: ScoringWeights;
}

const FORECAST_DAYS = 7;

/**
 * Ambiguity heuristic: when geocoding returns multiple candidates, auto-pick
 * the top one only if its population is more than 2× the next. Otherwise, ask
 * the user to disambiguate.
 *
 * Documented in specs/08-use-case.spec.md §Ambiguity heuristic.
 */
const AUTO_PICK_POPULATION_RATIO = 2;

export const makeRankActivitiesUseCase = (deps: RankActivitiesDeps): RankActivitiesUseCase => ({
  async execute(input, opts): Promise<RankingResult> {
    // Prefer the per-call logger (child with `requestId`) so upstream failures
    // are correlated with the originating GraphQL request. Falls back to the
    // root logger for boot-time pre-warm.
    const logger = opts?.logger ?? deps.logger;

    if (input.cityQuery == null && input.locationId == null) {
      // Belt-and-braces — the resolver's Zod validation should have caught this.
      return { kind: 'CityNotFound', query: '' };
    }
    if (input.cityQuery != null && input.locationId != null) {
      logger.warn(
        { cityQuery: input.cityQuery, locationId: input.locationId },
        'both cityQuery and locationId provided; locationId wins',
      );
    }

    // 1. Resolve location
    const resolved = await resolveLocation(deps, input, logger);
    if (resolved.kind !== 'Ok') return resolved;
    const location = resolved.location;

    // 2. Fetch forecast (fatal if fails — no scoring possible without it)
    let week: readonly DailyWeather[];
    try {
      week = await deps.weather.getDailyForecast(location, FORECAST_DAYS);
    } catch (err) {
      return upstreamUnavailable('open-meteo-forecast', err, logger);
    }

    // 3. Conditionally fetch marine + AQI (advisory — failures degrade one activity)
    const marine = await tryFetchMarine(deps, location, logger);
    const airQuality = await tryFetchAirQuality(deps, location, logger);

    // 5. Build per-day ScoringContext keyed by date
    const contextByDate = buildContextByDate(week, marine, airQuality, deps.weights);

    // 6. Score every activity × every day (safeRank isolates scorer bugs)
    const rankings: RankedForecast[] = deps.scorers
      .all()
      .map((scorer) =>
        safeRank(
          scorer,
          week,
          (day) => contextByDate.get(day.date) ?? { weights: deps.weights },
          logger,
        ),
      );

    // 7. Sort by overallScore desc; ties broken by activity kind (stable sort keeps insertion order)
    rankings.sort((a, b) => b.overallScore - a.overallScore);

    // 8. Summarize (contract: never throws)
    const generatedAt = deps.clock.now();
    const summary = await deps.summarizer.summarize({ city: location, rankings, generatedAt });

    return { kind: 'Ok', location, rankings, summary, generatedAt };
  },
});

// ---------- helpers ----------

type ResolvedLocation =
  | { kind: 'Ok'; location: Location }
  | { kind: 'CityNotFound'; query: string }
  | { kind: 'AmbiguousLocation'; candidates: readonly Location[] }
  | { kind: 'UpstreamUnavailable'; provider: string; cause?: string };

async function resolveLocation(
  deps: RankActivitiesDeps,
  input: RankActivitiesInput,
  logger: Logger,
): Promise<ResolvedLocation> {
  // locationId wins if both provided
  if (input.locationId != null) {
    try {
      const loc = await deps.geocoding.getById(input.locationId);
      return loc
        ? { kind: 'Ok', location: loc }
        : { kind: 'CityNotFound', query: input.locationId };
    } catch (err) {
      return upstreamUnavailable('open-meteo-geocoding', err, logger);
    }
  }

  // input.cityQuery is guaranteed non-null here by execute()'s guard
  const query = input.cityQuery!;
  let rawCandidates: readonly Location[];
  try {
    rawCandidates = await deps.geocoding.search(query, { limit: 5 });
  } catch (err) {
    return upstreamUnavailable('open-meteo-geocoding', err, logger);
  }

  if (rawCandidates.length === 0) return { kind: 'CityNotFound', query };
  if (rawCandidates.length === 1) return { kind: 'Ok', location: rawCandidates[0]! };

  // Open-Meteo returns candidates in relevance order, not population order.
  // Both the auto-pick heuristic AND the schema description promise "sorted
  // by population descending", so re-sort here (stable — ties keep relevance
  // order). Undefined populations sort to the bottom.
  const candidates = [...rawCandidates].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));

  // Ambiguity heuristic: auto-pick the top only if its population is more
  // than 2× the runner-up. Otherwise, hand the sorted list to the user.
  // Length >= 2 established by the guards above; assertions are safe here.
  const top = candidates[0]!;
  const second = candidates[1]!;
  if (
    top.population != null &&
    second.population != null &&
    top.population > AUTO_PICK_POPULATION_RATIO * second.population
  ) {
    logger.warn(
      {
        query,
        chosen: top.name,
        chosenPop: top.population,
        alternatives: candidates.slice(1).map((c) => c.name),
      },
      'ambiguous location auto-resolved by population lead',
    );
    return { kind: 'Ok', location: top };
  }

  return { kind: 'AmbiguousLocation', candidates };
}

async function tryFetchMarine(
  deps: RankActivitiesDeps,
  location: Location,
  logger: Logger,
): Promise<readonly MarineDaily[] | null> {
  try {
    return await deps.marine.getDailyMarine(location, FORECAST_DAYS);
  } catch (err) {
    if (err instanceof NotApplicableError) {
      logger.debug({ locationId: location.id, reason: err.reason }, 'marine not applicable');
    } else {
      logger.warn(
        { locationId: location.id, err },
        'marine fetch failed — surfing will show notApplicable',
      );
    }
    return null;
  }
}

async function tryFetchAirQuality(
  deps: RankActivitiesDeps,
  location: Location,
  logger: Logger,
): Promise<readonly AirQualityDaily[] | null> {
  try {
    return await deps.airQuality.getDailyAirQuality(location, FORECAST_DAYS);
  } catch (err) {
    if (err instanceof NotApplicableError) {
      logger.debug({ locationId: location.id, reason: err.reason }, 'AQI not applicable');
    } else {
      logger.warn(
        { locationId: location.id, err },
        'AQI fetch failed — outdoor will renormalise without clean-air component',
      );
    }
    return null;
  }
}

function buildContextByDate(
  week: readonly DailyWeather[],
  marine: readonly MarineDaily[] | null,
  airQuality: readonly AirQualityDaily[] | null,
  weights: ScoringWeights,
): Map<string, ScoringContext> {
  // Look up marine by date rather than index — the mapper drops days for
  // which Open-Meteo returned null wave data (see toMarineDaily). Alignment
  // by index would silently misattribute Friday's swell to Saturday if a
  // hole appears earlier in the week.
  const marineByDate = new Map(marine?.map((m) => [m.date, m]) ?? []);
  const aqiByDate = new Map(airQuality?.map((a) => [a.date, a]) ?? []);

  const contextByDate = new Map<string, ScoringContext>();
  for (const day of week) {
    const m = marineByDate.get(day.date);
    const a = aqiByDate.get(day.date);
    contextByDate.set(day.date, {
      ...(m ? { marine: m } : {}),
      ...(a ? { airQuality: a } : {}),
      weights,
    });
  }
  return contextByDate;
}

function upstreamUnavailable(
  provider: string,
  err: unknown,
  logger: Logger,
): ResolvedLocation & { kind: 'UpstreamUnavailable' } {
  const causeMessage = err instanceof UpstreamError ? err.message : String(err);
  logger.error({ provider, err }, 'upstream unavailable');
  return { kind: 'UpstreamUnavailable', provider, cause: causeMessage };
}
