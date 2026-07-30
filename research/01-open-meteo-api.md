# Open-Meteo API — Exhaustive Reference (verified July 2026)

All data below was verified against the live docs and by making real sample calls.

---

## 1. Complete Endpoint Map

| API | Base URL | Free? | Key needed? |
|---|---|---|---|
| Weather Forecast | `https://api.open-meteo.com/v1/forecast` | Yes (non‑commercial) | No |
| Marine Weather | `https://marine-api.open-meteo.com/v1/marine` | Yes | No |
| Air Quality | `https://air-quality-api.open-meteo.com/v1/air-quality` | Yes | No |
| Geocoding (search) | `https://geocoding-api.open-meteo.com/v1/search` | Yes | No |
| Geocoding (by id) | `https://geocoding-api.open-meteo.com/v1/get?id=<id>` | Yes | No |
| Historical (archive) | `https://archive-api.open-meteo.com/v1/archive` | Yes | No |
| Elevation | `https://api.open-meteo.com/v1/elevation` | Yes | No |
| Climate (CMIP6) | `https://climate-api.open-meteo.com/v1/climate` | Yes | No |
| Ensemble | `https://ensemble-api.open-meteo.com/v1/ensemble` | Yes | No |
| Flood / River discharge | `https://flood-api.open-meteo.com/v1/flood` | Yes | No |
| Satellite Radiation | `https://satellite-api.open-meteo.com/v1/archive` | Yes | No |
| Commercial mirror | `https://customer-api.open-meteo.com/v1/...` + `apikey=` | No | Yes |

Non-commercial use is free & keyless. CC-BY 4.0 attribution required.

**Rate limits (free tier)**: 600 req/min, 5,000 req/hour, 10,000 req/day, 300,000 req/month. A "call" is usually 1 request; complex ones (e.g. 2 weeks × 15 vars) can count as 1.5 calls. No hard cutoff yet — alert emails at 80/90/100% of monthly budget.

**CORS**: Enabled for browsers on all endpoints. **Formats**: `format=json` (default), `csv`, `xlsx`, `protobuf` (geocoding). **Errors**: HTTP 400 with `{"error": true, "reason": "..."}`.

---

## 2. Weather Forecast API — Full Spec

**Base**: `https://api.open-meteo.com/v1/forecast`

### Required
- `latitude`, `longitude` (float; comma-separated arrays supported)

### Common optional
| Param | Default | Values |
|---|---|---|
| `hourly` | — | comma list of hourly vars |
| `daily` | — | comma list of daily vars |
| `current` | — | any hourly var name |
| `minutely_15` | — | 15-min vars (Europe/N-America native, elsewhere interpolated) |
| `forecast_days` | 7 | 0–16 |
| `past_days` | 0 | 0–92 |
| `forecast_hours` / `past_hours` | — | integer |
| `start_date` / `end_date` | — | `yyyy-mm-dd` |
| `start_hour` / `end_hour` | — | `yyyy-mm-ddThh:mm` |
| `timezone` | `GMT` | IANA tz or `auto` |
| `temperature_unit` | `celsius` | `fahrenheit` |
| `wind_speed_unit` | `kmh` | `ms`, `mph`, `kn` |
| `precipitation_unit` | `mm` | `inch` |
| `timeformat` | `iso8601` | `unixtime` |
| `elevation` | auto (90 m DEM) | float or `nan` |
| `cell_selection` | `land` | `sea`, `nearest` |
| `models` | `auto` | see model list |
| `tilt`, `azimuth` | — | for `global_tilted_irradiance` |
| `apikey` | — | commercial only |

### Hourly variables (complete)
- **Temp/humidity**: `temperature_2m`, `relative_humidity_2m`, `dew_point_2m`, `apparent_temperature`, `wet_bulb_temperature_2m`
- **Pressure/atmos**: `pressure_msl`, `surface_pressure`, `cloud_cover`, `cloud_cover_low|mid|high`, `visibility` (m), `vapour_pressure_deficit`, `cape`, `freezing_level_height`, `lifted_index`, `convective_inhibition`, `boundary_layer_height`, `total_column_integrated_water_vapour`
- **Precip**: `precipitation`, `rain`, `showers`, `snowfall` (cm), `precipitation_probability` (%), `snow_depth` (m)
- **Wind** (each at 10 m, 80 m, 120 m, 180 m): `wind_speed_*`, `wind_direction_*`; plus `wind_gusts_10m`
- **Solar (mean over prev hour)**: `shortwave_radiation`, `direct_radiation`, `diffuse_radiation`, `direct_normal_irradiance`, `global_tilted_irradiance`, `terrestrial_solar_radiation` (and each with `_instant` suffix)
- **Evapotranspiration**: `evapotranspiration`, `et0_fao_evapotranspiration`, `reference_evapotranspiration`
- **Soil**: `soil_temperature_{0,6,18,54}cm`, `soil_moisture_{0_to_1,1_to_3,3_to_9,9_to_27,27_to_81}cm`
- **Other**: `weather_code` (WMO), `is_day`, `sunshine_duration` (s), `uv_index`, `uv_index_clear_sky`
- **Pressure levels** (1000–30 hPa, 19 levels): `temperature_{L}hPa`, `relative_humidity_{L}hPa`, `dew_point_{L}hPa`, `cloud_cover_{L}hPa`, `wind_speed_{L}hPa`, `wind_direction_{L}hPa`, `geopotential_height_{L}hPa`

### Daily variables (complete)
- **Temp**: `temperature_2m_max|min|mean`, `apparent_temperature_max|min|mean`, `{max|min|mean}_wet_bulb_temperature_2m`
- **Precip**: `precipitation_sum`, `rain_sum`, `showers_sum`, `snowfall_sum`, `precipitation_hours`, `precipitation_probability_max|mean|min`, `snowfall_water_equivalent_sum`
- **Wind**: `wind_speed_10m_max`, `wind_gusts_10m_max`, `wind_direction_10m_dominant`, `mean_wind_speed_10m`, `mean_wind_gusts_10m`, `min_wind_speed_10m`, `min_wind_gusts_10m`
- **Solar/light**: `shortwave_radiation_sum` (MJ/m²), `sunshine_duration` (s), `daylight_duration` (s), `uv_index_max`, `uv_index_clear_sky_max`
- **Cloud/humidity/pressure/visibility**: `{mean|max|min}_cloud_cover`, `{mean|max|min}_dew_point_2m`, `{mean|max|min}_relative_humidity_2m`, `{mean|max|min}_sea_level_pressure`, `{mean|max|min}_surface_pressure`, `{mean|max|min}_visibility`
- **Other**: `weather_code` (worst of day), `sunrise`, `sunset`, `{mean|max|min}_cape`, `maximum_updraft`, `et0_fao_evapotranspiration`, `mean_leaf_wetness_probability`, `growing_degree_days_base_0_limit_50`

### Response shape (verified against live call for Chamonix 2026-07-28)
```json
{
  "latitude": 45.9237, "longitude": 6.8694, "elevation": 1057.0,
  "generationtime_ms": 1.2,
  "utc_offset_seconds": 7200,
  "timezone": "Europe/Paris", "timezone_abbreviation": "CEST",
  "current_units": { "temperature_2m": "°C", ... },
  "current":       { "time": "2026-07-28T09:00", "temperature_2m": 16.4, ... },
  "hourly_units":  { "temperature_2m": "°C", "snowfall": "cm", ... },
  "hourly": {
    "time": ["2026-07-28T00:00","2026-07-28T01:00", ...],
    "temperature_2m": [16.4, 16.4, 16.0, ...],
    "snowfall": [0, 0, 0, ...]
  },
  "daily_units": { "temperature_2m_max": "°C", ... },
  "daily": {
    "time": ["2026-07-28","2026-07-29", ...],
    "temperature_2m_max": [...],
    "snowfall_sum": [...]
  }
}
```

### WMO weather codes
`0` clear · `1–3` mainly clear → overcast · `45,48` fog · `51–57` drizzle · `61–67` rain · `71–77` snow · `80–82` rain showers · `85–86` snow showers · `95` thunderstorm · `96,99` thunderstorm w/ hail.

---

## 3. Marine Weather API — Full Spec (crucial for surfing)

**Base**: `https://marine-api.open-meteo.com/v1/marine`

### Params
- Required: `latitude`, `longitude`
- Optional: `hourly`, `daily`, `current`, `forecast_days` (0–8, default 5), `past_days` (0–92), `timezone`, `timeformat`, `length_unit` (`metric`/`imperial`), `cell_selection` (default `sea`; use `nearest` for coastal points), `apikey`

### Hourly variables (complete)
- **Combined waves**: `wave_height` (m), `wave_direction` (°), `wave_period` (s), `wave_peak_period` (s)
- **Wind waves** (locally generated): `wind_wave_height`, `wind_wave_direction`, `wind_wave_period`, `wind_wave_peak_period`
- **Primary swell**: `swell_wave_height`, `swell_wave_direction`, `swell_wave_period`, `swell_wave_peak_period`
- **Secondary swell**: `secondary_swell_wave_height`, `secondary_swell_wave_direction`, `secondary_swell_wave_period`
- **Tertiary swell**: `tertiary_swell_wave_height`, `tertiary_swell_wave_direction`, `tertiary_swell_wave_period`
- **Ocean**: `ocean_current_velocity` (km/h), `ocean_current_direction` (°), `sea_surface_temperature` (°C), `sea_level_height_msl` (m), `invert_barometer_height` (m)

### Daily variables
`wave_height_max`, `wind_wave_height_max`, `swell_wave_height_max`; `wave_direction_dominant`, `wind_wave_direction_dominant`, `swell_wave_direction_dominant`; `wave_period_max`, `wind_wave_period_max`, `swell_wave_period_max`, `wind_wave_peak_period_max`, `swell_wave_peak_period_max`.

### Models
`meteofrance_wave` (MFWAM ~8 km global), `ewam` (DWD Europe ~5 km), `gwam` (DWD global ~25 km), `ecmwf_wam025`, `ncep_gfs_wave025`, `ncep_gfs_wave016`, `era5_ocean` (reanalysis).

**Important**: Marine API does NOT return `wind_speed_10m` or air temp — combine it with a call to the Forecast API. Coastal accuracy is limited; use `cell_selection=nearest` if the exact coords are just inland.

---

## 4. Geocoding API — Full Spec

**Base**: `https://geocoding-api.open-meteo.com/v1/search`

### Params
| Param | Type | Default | Notes |
|---|---|---|---|
| `name` | string (required) | — | 2+ chars exact, 3+ fuzzy |
| `count` | int | 10 | max 100 |
| `language` | string | `en` | e.g. `fr`, `de`, `pt` |
| `format` | `json` \| `protobuf` | `json` | |
| `countryCode` | ISO-3166-1 α2 | — | disambiguation filter |
| `apikey` | | | commercial only |

### Verified response (Chamonix)
```json
{
  "results": [{
    "id": 3027301,
    "name": "Chamonix",
    "latitude": 45.92375, "longitude": 6.86933, "elevation": 1060.0,
    "feature_code": "PPL",
    "country_code": "FR", "country": "France", "country_id": 3017382,
    "admin1": "Rhône-Alpes",  "admin1_id": 11071625,
    "admin2": "Upper Savoy",  "admin2_id": 3013736,
    "admin3": "Arrondissement de Bonneville",
    "admin4": "Chamonix",
    "timezone": "Europe/Paris",
    "population": 10614,
    "postcodes": ["74400","74401 CEDEX"]
  }],
  "generationtime_ms": 0.36
}
```

### Disambiguation strategy
1. `count=5` (or higher), show user `name`, `admin1`, `country`, and `population` so they can pick between e.g. "Springfield, MO" vs "Springfield, IL".
2. Sort/prioritise by `population` desc when auto-picking a single result.
3. Use `countryCode=FR` to force country match.
4. If no `results` key returned (empty response), no matches were found — the field is simply absent.
5. Store `id` — you can re-resolve later via `https://geocoding-api.open-meteo.com/v1/get?id=3027301`.

---

## 5. Air Quality API — Full Spec (for outdoor sightseeing)

**Base**: `https://air-quality-api.open-meteo.com/v1/air-quality`

### Hourly variables
- **Pollutants (µg/m³)**: `pm10`, `pm2_5`, `carbon_monoxide`, `nitrogen_dioxide`, `sulphur_dioxide`, `ozone`, `dust`, `methane`, `ammonia` (Europe only)
- `carbon_dioxide` (ppm)
- `aerosol_optical_depth` (dimensionless)
- `uv_index`, `uv_index_clear_sky`
- **Pollen (Europe, grains/m³)**: `alder_pollen`, `birch_pollen`, `grass_pollen`, `mugwort_pollen`, `olive_pollen`, `ragweed_pollen`
- **AQI composite + per-pollutant**: `european_aqi`, `european_aqi_pm2_5`, `european_aqi_pm10`, `european_aqi_nitrogen_dioxide`, `european_aqi_ozone`, `european_aqi_sulphur_dioxide`; `us_aqi` and variants

---

## 6. Scoring recommendations for the 4 activities

### Skiing (Forecast API)
Daily: `snowfall_sum`, `precipitation_sum`, `temperature_2m_max`, `temperature_2m_min`, `wind_speed_10m_max`, `wind_gusts_10m_max`, `weather_code`.
Hourly (aggregate): `snow_depth` (want deep + stable), `visibility` (avoid <1000 m), `temperature_2m` (want < 0 °C most of day), `wind_speed_10m` (< 40 km/h for open lifts).
Rule of thumb: reward `snow_depth > 0.3 m`, penalise `temperature_2m_max > 5 °C` (melt), penalise `wind_gusts_10m_max > 60 km/h` (closed lifts), reward `snowfall_sum` in the next 24 h (fresh pow).

### Surfing (Marine API + Forecast API, two calls)
Marine hourly: `swell_wave_height` (target 0.8–2.5 m), `swell_wave_period` (target ≥ 10 s = groundswell; < 7 s = local chop = bad), `swell_wave_direction`, `wave_height`, `sea_surface_temperature`.
Forecast hourly (same lat/lon): `wind_speed_10m`, `wind_direction_10m` (offshore = good), `wind_gusts_10m`, `temperature_2m`.
Rule: score = f(swell height in range) × f(period ≥ 10 s) × f(wind ≤ 15 km/h offshore). Onshore wind above 20 km/h ruins it regardless of swell.

### Outdoor sightseeing (Forecast + Air Quality)
Forecast daily: `precipitation_probability_max`, `precipitation_sum`, `temperature_2m_max|min`, `apparent_temperature_max`, `mean_cloud_cover`, `uv_index_max`, `wind_speed_10m_max`, `sunshine_duration`, `daylight_duration`, `weather_code`.
Air Quality hourly (aggregate to daily mean/max): `european_aqi` or `us_aqi`, `pm2_5`.
Rule: reward `apparent_temperature ∈ [15, 26 °C]`, penalise `precipitation_probability_max > 40 %`, penalise AQI > 100, cap UV bonus (too high = harmful), reward `sunshine_duration / daylight_duration`.

### Indoor sightseeing (inverse of outdoor)
Same variables as outdoor but inverted: reward `precipitation_probability_max > 60 %`, reward `apparent_temperature < 5 °C or > 30 °C`, reward high wind/gust days, reward cloudy. Museum days.

---

## 7. Practical patterns

### Sample: 7-day Chamonix skiing payload
```bash
curl "https://api.open-meteo.com/v1/forecast?\
latitude=45.9237&longitude=6.8694&\
daily=weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum,\
precipitation_sum,precipitation_probability_max,wind_speed_10m_max,\
wind_gusts_10m_max,uv_index_max,sunshine_duration&\
hourly=snow_depth,visibility,temperature_2m,wind_speed_10m&\
current=temperature_2m,snowfall,wind_speed_10m&\
timezone=auto&forecast_days=7"
```

### Sample: Rio de Janeiro surfing (marine + forecast)
```bash
curl "https://marine-api.open-meteo.com/v1/marine?\
latitude=-22.97&longitude=-43.18&\
daily=wave_height_max,swell_wave_height_max,wave_period_max,\
swell_wave_direction_dominant&\
hourly=wave_height,swell_wave_height,swell_wave_period,swell_wave_direction&\
timezone=auto&forecast_days=7&cell_selection=nearest"
```

### Sample: Barcelona outdoor sightseeing
```bash
curl "https://api.open-meteo.com/v1/forecast?\
latitude=41.3874&longitude=2.1686&\
daily=weather_code,temperature_2m_max,temperature_2m_min,\
apparent_temperature_max,precipitation_probability_max,precipitation_sum,\
uv_index_max,sunshine_duration,daylight_duration,mean_cloud_cover,\
wind_speed_10m_max&timezone=auto&forecast_days=7"

curl "https://air-quality-api.open-meteo.com/v1/air-quality?\
latitude=41.3874&longitude=2.1686&\
hourly=european_aqi,pm2_5,pm10,ozone&timezone=auto&forecast_days=7"
```

### Sample: geocode a city name
```bash
curl "https://geocoding-api.open-meteo.com/v1/search?\
name=Rio%20de%20Janeiro&count=5&language=en&format=json"
```

### Timezone handling
- Always pass `timezone=auto` when you also request `daily=` — otherwise "days" get bucketed at GMT midnight.
- Response echoes `utc_offset_seconds`, `timezone`, `timezone_abbreviation`.
- Alternatively use `timeformat=unixtime` to get integers.

### Units
- `precipitation_unit=mm|inch`; `snowfall` is in **cm** (or inches), `snow_depth` in **m**. Marine wave heights in **m** (or ft with `length_unit=imperial`).
- `wind_speed_unit=kmh|ms|mph|kn`.
- `temperature_unit=celsius|fahrenheit`.
- Directions in degrees, meteorological convention (0° = coming from north).

### Caching guidance
- Forecast models update every 3–6 h (global) / 1 h (regional); marine 6–12 h; AQ 24 h.
- Safe cache TTL: **30–60 min forecast/marine**, **1–2 h air quality**, **24 h geocoding**. Elevation is immutable — cache forever.
- Cache key: `(lat,lon rounded to 3-4 decimals)|activity|forecast_days`.

### Payload minimisation
- Only request specific variables (both `hourly` and `daily`).
- Prefer `daily` aggregates over `hourly` when possible.
- For multiple cities, use comma-separated coords → response becomes JSON **array**.

### Error handling
```json
{ "error": true, "reason": "Latitude must be in range of -90 to 90°" }
```
Returned with HTTP 400. Also handle: 429 (rate limit — back off), 5xx (retry with jitter). Marine API returns 400 if coords are far inland even with `cell_selection=nearest`.

---

## Sources
- https://open-meteo.com/en/docs
- https://open-meteo.com/en/docs/marine-weather-api
- https://open-meteo.com/en/docs/geocoding-api
- https://open-meteo.com/en/docs/air-quality-api
- https://open-meteo.com/en/pricing
- https://open-meteo.com/en/terms
- https://github.com/open-meteo/open-meteo
