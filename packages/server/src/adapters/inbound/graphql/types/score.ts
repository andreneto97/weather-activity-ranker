import { builder } from '../builder.js';

export const DayWeatherType = builder.objectType('DayWeather', {
  description:
    'Raw daily forecast (WMO code, min/max temp, precipitation, wind, cloud cover). Used by the DayCard / DayDetail UI to render a matching icon and narrative.',
  fields: (t) => ({
    weatherCode: t.int({
      description: 'WMO weather-interpretation code (0..99).',
      nullable: false,
      resolve: (w) => w.weatherCode,
    }),
    tempMinC: t.float({
      description: 'Daily minimum temperature in Celsius.',
      nullable: false,
      resolve: (w) => w.temperature.minC,
    }),
    tempMaxC: t.float({
      description: 'Daily maximum temperature in Celsius.',
      nullable: false,
      resolve: (w) => w.temperature.maxC,
    }),
    precipitationProbabilityMaxPct: t.int({
      description: 'Peak precipitation probability across the day (0..100).',
      nullable: false,
      resolve: (w) => w.precipitationProbabilityMaxPct,
    }),
    windMaxKmh: t.float({
      description: 'Peak wind speed in km/h.',
      nullable: false,
      resolve: (w) => w.wind.maxKmh,
    }),
    cloudCoverPct: t.int({
      description: 'Mean daily cloud cover (0..100).',
      nullable: false,
      resolve: (w) => w.cloudCoverPct,
    }),
  }),
});

export const ScoreComponentType = builder.objectType('ScoreComponent', {
  description: "One contributing factor of a score, e.g. 'fresh snow' or 'low wind'.",
  fields: (t) => ({
    label: t.exposeString('label', { nullable: false }),
    value: t.float({
      description: '0..1 normalized contribution.',
      nullable: false,
      resolve: (c) => c.value,
    }),
    weight: t.float({
      description: '0..1 weight of this component in the overall score.',
      nullable: false,
      resolve: (c) => c.weight,
    }),
  }),
});

/**
 * Recognises the `notApplicableScore(reason)` signature emitted by the domain:
 * a single component with weight 1 and value 0. Making this an explicit field
 * on `Score` means the frontend does not need to inspect the components shape
 * (fragile: any refactor of the domain shape silently breaks the UI).
 */
function isNotApplicableScore(score: {
  readonly value: number;
  readonly components: ReadonlyArray<{ value: number; weight: number }>;
}): boolean {
  if (score.value !== 0) return false;
  if (score.components.length !== 1) return false;
  const only = score.components[0];
  return only?.value === 0 && only.weight === 1;
}

export const ScoreType = builder.objectType('Score', {
  description: 'A 0..100 desirability score plus its breakdown.',
  fields: (t) => ({
    value: t.exposeInt('value', { nullable: false }),
    components: t.field({
      type: [ScoreComponentType],
      nullable: false,
      resolve: (s) => [...s.components],
    }),
    notApplicable: t.boolean({
      description:
        'True when this activity does not apply for this day/location — the domain returns `notApplicableScore(reason)`, e.g. surfing inland or when the marine feed had a gap for this day. Frontend should render an N/A placeholder rather than a 0-score card.',
      nullable: false,
      resolve: (s) => isNotApplicableScore(s),
    }),
    notApplicableReason: t.string({
      description:
        "Human-readable reason present when `notApplicable` is true; otherwise null (e.g. 'No coastal access').",
      nullable: true,
      resolve: (s) => (isNotApplicableScore(s) ? (s.components[0]?.label ?? null) : null),
    }),
  }),
});

export const DailyScoreType = builder.objectType('DailyScore', {
  description: 'Score for a single day.',
  fields: (t) => ({
    date: t.string({
      description: "ISO date (YYYY-MM-DD) in the city's local timezone.",
      nullable: false,
      resolve: (d) => d.date,
    }),
    score: t.field({
      type: ScoreType,
      nullable: false,
      resolve: (d) => d.score,
    }),
    weather: t.field({
      type: DayWeatherType,
      description:
        'Raw forecast for the day. Null only when the scorer threw and the ranking is a placeholder (see safeRank).',
      nullable: true,
      resolve: (d) => d.weather ?? null,
    }),
  }),
});
