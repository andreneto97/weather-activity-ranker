import type { AirQualityDaily, DailyWeather, MarineDaily } from '../../../domain/daily-weather.js';
import type { Location } from '../../../domain/location.js';
import type {
  AirQualityResponseDto,
  ForecastResponseDto,
  GeocodingResultDto,
  MarineResponseDto,
} from './dto.js';

/**
 * Pure DTO → domain mappers. Adapters call these after Zod-parsing the raw
 * Open-Meteo JSON; nothing else in the codebase touches raw provider shapes.
 */

/** Zip column-oriented daily arrays into row-oriented DailyWeather[]. */
export function toDailyWeather(dto: ForecastResponseDto): DailyWeather[] {
  const d = dto.daily;
  return d.time.map((date, i) => ({
    date,
    temperature: {
      minC: d.temperature_2m_min[i]!,
      maxC: d.temperature_2m_max[i]!,
    },
    apparentTempMaxC: d.apparent_temperature_max[i]!,
    precipitationMm: d.precipitation_sum[i]!,
    precipitationProbabilityMaxPct: d.precipitation_probability_max[i]!,
    snowfallCm: d.snowfall_sum[i]!,
    wind: {
      maxKmh: d.wind_speed_10m_max[i]!,
      gustsKmh: d.wind_gusts_10m_max[i]!,
    },
    cloudCoverPct: d.cloud_cover_mean[i]!,
    uvIndexMax: d.uv_index_max[i]!,
    // Open-Meteo returns sunshine in seconds; convert to hours.
    sunshineHours: d.sunshine_duration[i]! / 3600,
    weatherCode: d.weather_code[i]!,
  }));
}

export function toMarineDaily(dto: MarineResponseDto): MarineDaily[] {
  const d = dto.daily;
  const result: MarineDaily[] = [];
  for (let i = 0; i < d.time.length; i++) {
    const wave = d.wave_height_max[i];
    const swellH = d.swell_wave_height_max[i];
    const swellP = d.swell_wave_period_max[i];
    // Drop days where any wave field is null (grid cell has no data that day).
    // The use case looks up marine by date, so a hole here becomes surf N/A
    // for that specific day instead of failing the whole ranking.
    if (wave == null || swellH == null || swellP == null) continue;
    result.push({
      date: d.time[i]!,
      waveHeightMaxM: wave,
      swellHeightMaxM: swellH,
      swellPeriodMaxS: swellP,
    });
  }
  return result;
}

/**
 * AQI is returned hourly (168 entries for 7 days). Aggregate to daily mean,
 * skipping null gaps. If a full day has no data we still emit an entry with
 * NaN → the outdoor scorer should be given `undefined` in that case by the
 * adapter, but for now we emit 0 and let downstream code detect the fallback.
 * (In practice the whole request throws NotApplicableError if AQI coverage
 * is missing — this is the "some hours missing" case only.)
 */
export function toAirQualityDaily(dto: AirQualityResponseDto): AirQualityDaily[] {
  const h = dto.hourly;
  const bucketByDate = new Map<
    string,
    { aqiSum: number; aqiCount: number; pmSum: number; pmCount: number }
  >();

  for (let i = 0; i < h.time.length; i++) {
    const date = (h.time[i] ?? '').slice(0, 10); // 'YYYY-MM-DDTHH:MM' → 'YYYY-MM-DD'
    if (!date) continue;
    const bucket = bucketByDate.get(date) ?? {
      aqiSum: 0,
      aqiCount: 0,
      pmSum: 0,
      pmCount: 0,
    };
    const aqi = h.european_aqi[i];
    const pm = h.pm2_5[i];
    if (aqi != null) {
      bucket.aqiSum += aqi;
      bucket.aqiCount += 1;
    }
    if (pm != null) {
      bucket.pmSum += pm;
      bucket.pmCount += 1;
    }
    bucketByDate.set(date, bucket);
  }

  return [...bucketByDate.entries()].map(([date, b]) => ({
    date,
    aqiMean: b.aqiCount > 0 ? b.aqiSum / b.aqiCount : 0,
    pm25MeanUgm3: b.pmCount > 0 ? b.pmSum / b.pmCount : 0,
  }));
}

export function toLocation(dto: GeocodingResultDto): Location {
  return {
    id: String(dto.id),
    name: dto.name,
    country: dto.country ?? 'Unknown',
    ...(dto.admin1 !== undefined ? { admin1: dto.admin1 } : {}),
    latitude: dto.latitude,
    longitude: dto.longitude,
    timezone: dto.timezone,
    ...(dto.population !== undefined ? { population: dto.population } : {}),
  };
}
