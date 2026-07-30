import type {
  AirQualityDaily,
  DailyWeather,
  MarineDaily,
} from '../../../../domain/daily-weather.js';

/**
 * Synthetic 7-day weather generators for stub adapters. Deterministic (seeded
 * by locationId) so the same city always gets the same synthetic week —
 * matches the real adapter's implicit "same request = same response" property.
 */

const seededRandom = (seed: string): (() => number) => {
  // xmur3 hash + mulberry32 PRNG — small deterministic RNG.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const daysFrom = (startISO: string): string[] => {
  const start = new Date(`${startISO}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
};

const today = (): string => new Date().toISOString().slice(0, 10);

export function synthWeather(locationId: string, latitude: number): DailyWeather[] {
  const rnd = seededRandom(`weather:${locationId}`);
  const dates = daysFrom(today());
  const isCold = latitude > 55 || latitude < -55; // rough polar approximation
  const baseTempC = isCold ? -5 : 22;

  return dates.map((date) => {
    const tempMax = baseTempC + Math.floor(rnd() * 10 - 5);
    const tempMin = tempMax - 6 - Math.floor(rnd() * 4);
    const isSnowfall = isCold && rnd() > 0.4;
    return {
      date,
      temperature: { minC: tempMin, maxC: tempMax },
      apparentTempMaxC: tempMax - 1,
      precipitationMm: Math.floor(rnd() * 5),
      precipitationProbabilityMaxPct: Math.floor(rnd() * 60) + 10,
      snowfallCm: isSnowfall ? Math.floor(rnd() * 15) : 0,
      wind: {
        maxKmh: Math.floor(rnd() * 20) + 5,
        gustsKmh: Math.floor(rnd() * 30) + 10,
      },
      cloudCoverPct: Math.floor(rnd() * 80) + 10,
      uvIndexMax: isCold ? Math.floor(rnd() * 3) : Math.floor(rnd() * 7) + 3,
      sunshineHours: Math.floor(rnd() * 10) + 2,
      weatherCode: isSnowfall ? 71 : rnd() > 0.5 ? 0 : 3,
    };
  });
}

export function synthMarine(locationId: string): MarineDaily[] {
  const rnd = seededRandom(`marine:${locationId}`);
  const dates = daysFrom(today());
  return dates.map((date) => ({
    date,
    waveHeightMaxM: 0.5 + rnd() * 2,
    swellHeightMaxM: 0.5 + rnd() * 1.5,
    swellPeriodMaxS: 6 + Math.floor(rnd() * 8),
  }));
}

export function synthAirQuality(locationId: string): AirQualityDaily[] {
  const rnd = seededRandom(`aqi:${locationId}`);
  const dates = daysFrom(today());
  return dates.map((date) => ({
    date,
    aqiMean: Math.floor(rnd() * 60) + 20,
    pm25MeanUgm3: Math.floor(rnd() * 15) + 3,
  }));
}
