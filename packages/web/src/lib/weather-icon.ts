/**
 * WMO weather-interpretation code → Meteocons icon name.
 * Codes are the standard WMO codes returned by Open-Meteo's `weather_code`
 * daily variable. Icons come from the @iconify-json/meteocons pack, using
 * the `-fill` variant (colourful gradients — dense enough to read on a
 * white card). The default no-suffix names are the `-line` outline style
 * which was too pale against the light-cream palette.
 *
 * We prefer `-day` variants since DailyScore is a whole-day summary;
 * night variants would misrepresent a mostly-sunny day.
 *
 * WMO reference: https://open-meteo.com/en/docs § weather_code interpretation
 */
export function meteoconFor(weatherCode: number): string {
  const c = weatherCode;
  if (c === 0) return 'meteocons:clear-day-fill';
  if (c === 1 || c === 2) return 'meteocons:partly-cloudy-day-fill';
  if (c === 3) return 'meteocons:overcast-day-fill';
  if (c === 45 || c === 48) return 'meteocons:fog-day-fill';
  if (c >= 51 && c <= 55) return 'meteocons:drizzle-fill';
  if (c === 56 || c === 57) return 'meteocons:sleet-fill';
  if (c >= 61 && c <= 65) return 'meteocons:rain-fill';
  if (c === 66 || c === 67) return 'meteocons:sleet-fill';
  if (c >= 71 && c <= 75) return 'meteocons:snow-fill';
  if (c === 77) return 'meteocons:snow-fill';
  if (c === 80 || c === 81 || c === 82) return 'meteocons:partly-cloudy-day-rain-fill';
  if (c === 85 || c === 86) return 'meteocons:partly-cloudy-day-snow-fill';
  if (c === 95) return 'meteocons:thunderstorms-day-fill';
  if (c === 96 || c === 99) return 'meteocons:thunderstorms-day-extreme-fill';
  return 'meteocons:not-available-fill';
}

export function weatherLabel(weatherCode: number): string {
  const c = weatherCode;
  if (c === 0) return 'Clear';
  if (c <= 2) return 'Mostly clear';
  if (c === 3) return 'Overcast';
  if (c === 45 || c === 48) return 'Fog';
  if (c <= 55) return 'Drizzle';
  if (c <= 57) return 'Freezing drizzle';
  if (c <= 65) return 'Rain';
  if (c <= 67) return 'Freezing rain';
  if (c <= 75) return 'Snow';
  if (c === 77) return 'Snow grains';
  if (c <= 82) return 'Rain showers';
  if (c <= 86) return 'Snow showers';
  if (c === 95) return 'Thunderstorm';
  if (c === 96 || c === 99) return 'Thunderstorm with hail';
  return 'Unknown';
}
