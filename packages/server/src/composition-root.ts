import Anthropic from '@anthropic-ai/sdk';
import type { Logger } from 'pino';
import {
  withAirQualityCache,
  withGeocodingCache,
  withMarineCache,
  withWeatherCache,
} from './adapters/outbound/cache/lru-cached.js';
import { SystemClock } from './adapters/outbound/clock/system-clock.js';
import { createOpenMeteoAirQualityAdapter } from './adapters/outbound/open-meteo/air-quality.adapter.js';
import { createOpenMeteoGeocodingAdapter } from './adapters/outbound/open-meteo/geocoding.adapter.js';
import { createOpenMeteoMarineAdapter } from './adapters/outbound/open-meteo/marine.adapter.js';
import {
  StubAirQualityAdapter,
  StubGeocodingAdapter,
  StubMarineAdapter,
  StubWeatherAdapter,
} from './adapters/outbound/open-meteo/stubs/index.js';
import { createOpenMeteoWeatherAdapter } from './adapters/outbound/open-meteo/weather.adapter.js';
import { ClaudeHaikuSummarizer } from './adapters/outbound/summarizer/claude-haiku-summarizer.js';
import { TemplateSummarizer } from './adapters/outbound/summarizer/template-summarizer.js';
import { type GeocodeUseCase, makeGeocodeUseCase } from './application/geocode.usecase.js';
import {
  type RankActivitiesUseCase,
  makeRankActivitiesUseCase,
} from './application/rank-activities.usecase.js';
import { defaultScoringWeights } from './config/scoring.config.js';
import { createIndoorScorer } from './domain/scoring/indoor-scorer.js';
import { createOutdoorScorer } from './domain/scoring/outdoor-scorer.js';
import { ScorerRegistry } from './domain/scoring/registry.js';
import { createSkiScorer } from './domain/scoring/ski-scorer.js';
import { createSurfScorer } from './domain/scoring/surf-scorer.js';
import type { ServerEnv } from './infrastructure/env.js';
import { type HttpClient, createHttpClient } from './infrastructure/http.js';
import { createLogger } from './infrastructure/logger.js';
import type { AirQualityPort } from './ports/air-quality.port.js';
import type { ClockPort } from './ports/clock.port.js';
import type { GeocodingPort } from './ports/geocoding.port.js';
import type { MarinePort } from './ports/marine.port.js';
import type { SummarizerPort } from './ports/summarizer.port.js';
import type { WeatherPort } from './ports/weather.port.js';

/**
 * The DI graph. `buildContainer(env, overrides?)` is the ONLY place that
 * `new`s up adapters. Tests can swap in fakes via `overrides`.
 *
 * See specs/08-use-case.spec.md §Composition root.
 */
export interface Container {
  readonly rankActivities: RankActivitiesUseCase;
  readonly geocode: GeocodeUseCase;
  readonly logger: Logger;
  /** Exposed for main.ts pre-warm and tests. Not used by resolvers. */
  readonly geocoding: GeocodingPort;
  readonly weather: WeatherPort;
  readonly marine: MarinePort;
  readonly airQuality: AirQualityPort;
}

export interface BuildContainerOverrides {
  readonly logger?: Logger;
  readonly clock?: ClockPort;
  readonly http?: HttpClient;
  readonly summarizer?: SummarizerPort;
  readonly geocoding?: GeocodingPort;
  readonly weather?: WeatherPort;
  readonly marine?: MarinePort;
  readonly airQuality?: AirQualityPort;
}

const CACHE_MAX_ENTRIES = 500;

export function buildContainer(env: ServerEnv, overrides: BuildContainerOverrides = {}): Container {
  const logger = overrides.logger ?? createLogger(env);
  const clock = overrides.clock ?? new SystemClock();
  const http = overrides.http ?? createHttpClient({ timeoutMs: env.OPEN_METEO_TIMEOUT_MS });
  const isStub = env.OPEN_METEO_MODE === 'stub';

  // ---------- Outbound adapters (with cache) ----------

  const geocoding =
    overrides.geocoding ??
    withGeocodingCache(
      isStub ? new StubGeocodingAdapter() : createOpenMeteoGeocodingAdapter(http),
      { ttlMs: env.CACHE_TTL_GEOCODING_MS, max: CACHE_MAX_ENTRIES },
    );

  const weather =
    overrides.weather ??
    withWeatherCache(isStub ? new StubWeatherAdapter() : createOpenMeteoWeatherAdapter(http), {
      ttlMs: env.CACHE_TTL_WEATHER_MS,
      max: CACHE_MAX_ENTRIES,
    });

  const marine =
    overrides.marine ??
    withMarineCache(isStub ? new StubMarineAdapter() : createOpenMeteoMarineAdapter(http), {
      ttlMs: env.CACHE_TTL_MARINE_MS,
      max: CACHE_MAX_ENTRIES,
    });

  const airQuality =
    overrides.airQuality ??
    withAirQualityCache(
      isStub ? new StubAirQualityAdapter() : createOpenMeteoAirQualityAdapter(http),
      { ttlMs: env.CACHE_TTL_AQI_MS, max: CACHE_MAX_ENTRIES },
    );

  // ---------- Scorers (registered fluently) ----------

  const scorers = new ScorerRegistry()
    .register(createSkiScorer(defaultScoringWeights.ski))
    .register(createSurfScorer(defaultScoringWeights.surf))
    .register(createOutdoorScorer(defaultScoringWeights.outdoor))
    .register(createIndoorScorer(defaultScoringWeights.indoor));

  // ---------- Summarizer (Claude Haiku or template) ----------

  const template = new TemplateSummarizer();
  const summarizer: SummarizerPort =
    overrides.summarizer ??
    (env.ANTHROPIC_API_KEY
      ? new ClaudeHaikuSummarizer({
          // Explicit `timeout` + `maxRetries: 0` at the SDK level so a hung
          // socket can't outlive our own 3s `withTimeout` wrapper. Belt-and-
          // braces: the wrapper resolves the promise but the underlying
          // request stays in flight until either responds; the SDK guarantees
          // it aborts by 5s.
          client: new Anthropic({
            apiKey: env.ANTHROPIC_API_KEY,
            timeout: 5_000,
            maxRetries: 0,
          }),
          fallback: template,
          dailyCap: env.SUMMARIZER_DAILY_CAP,
          clock,
          logger,
        })
      : template);

  // ---------- Use cases ----------

  const rankActivities = makeRankActivitiesUseCase({
    geocoding,
    weather,
    marine,
    airQuality,
    scorers,
    summarizer,
    clock,
    logger,
    weights: defaultScoringWeights,
  });

  const geocode = makeGeocodeUseCase({ geocoding });

  logger.info(
    {
      mode: env.OPEN_METEO_MODE,
      summarizer: env.ANTHROPIC_API_KEY ? 'claude-haiku' : 'template',
    },
    'container wired',
  );

  return { rankActivities, geocode, logger, geocoding, weather, marine, airQuality };
}
