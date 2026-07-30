import { z } from 'zod';

/**
 * Zod schemas mirroring Open-Meteo response shapes we depend on.
 * Any drift in these fields fails at the adapter boundary via HttpClient,
 * with a readable error message. Fields we don't consume aren't listed —
 * this doubles as documentation of "these are what we depend on".
 *
 * See specs/03-open-meteo-adapters.spec.md, research/01-open-meteo-api.md.
 */

// ---------- Forecast API ----------

export const ForecastResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    apparent_temperature_max: z.array(z.number()),
    precipitation_sum: z.array(z.number()),
    precipitation_probability_max: z.array(z.number()),
    snowfall_sum: z.array(z.number()),
    wind_speed_10m_max: z.array(z.number()),
    wind_gusts_10m_max: z.array(z.number()),
    cloud_cover_mean: z.array(z.number()),
    uv_index_max: z.array(z.number()),
    sunshine_duration: z.array(z.number()),
  }),
});
export type ForecastResponseDto = z.infer<typeof ForecastResponseSchema>;

// ---------- Geocoding API ----------

const GeocodingResultSchema = z.object({
  id: z.number(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string().optional(), // some obscure entries lack `country`
  admin1: z.string().optional(),
  timezone: z.string(),
  population: z.number().optional(),
});
export type GeocodingResultDto = z.infer<typeof GeocodingResultSchema>;

/**
 * Response for /v1/search. `results` may be absent when there are no matches.
 * We normalise to [] in the mapper.
 */
export const GeocodingSearchResponseSchema = z.object({
  results: z.array(GeocodingResultSchema).optional(),
});
export type GeocodingSearchResponseDto = z.infer<typeof GeocodingSearchResponseSchema>;

/** Response for /v1/get?id=… — returns the same shape as one search result. */
export const GeocodingGetResponseSchema = GeocodingResultSchema;

// ---------- Marine API ----------

export const MarineResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  daily: z.object({
    time: z.array(z.string()),
    // Open-Meteo Marine returns null for individual days when the resolved
    // grid cell has no wave data for that timestamp (coastal cell partially
    // inside a bay, forecast beyond model horizon, etc.). Same tolerance
    // pattern the AQI schema already uses. Mapper drops null days and the
    // use case looks up marine by date, not by index.
    wave_height_max: z.array(z.number().nullable()),
    swell_wave_height_max: z.array(z.number().nullable()),
    swell_wave_period_max: z.array(z.number().nullable()),
  }),
});
export type MarineResponseDto = z.infer<typeof MarineResponseSchema>;

/** Open-Meteo error shape (returned as HTTP 400 with a JSON body). */
export const OpenMeteoErrorSchema = z.object({
  error: z.literal(true),
  reason: z.string(),
});
export type OpenMeteoErrorDto = z.infer<typeof OpenMeteoErrorSchema>;

// ---------- Air Quality API ----------

export const AirQualityResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  hourly: z.object({
    time: z.array(z.string()), // ISO-8601 with hour, 168 entries for 7 days
    european_aqi: z.array(z.number().nullable()), // Open-Meteo can return null gaps
    pm2_5: z.array(z.number().nullable()),
  }),
});
export type AirQualityResponseDto = z.infer<typeof AirQualityResponseSchema>;
