# 07 — UI/UX

## Purpose

Deliver a UI that reads as "someone senior cared about craft" — not gimmicky, but purposeful. Every animation is justified, every color reacts to context, every micro-interaction respects accessibility.

## Design references

- Apple Weather (background follows conditions)
- Surfline (morning/noon/evening micro-heatmap; multi-day trend)
- OpenSnow (leaderboard-style "best day right now")
- Nomad List (filter-chip primary control)
- Apple Design Awards 2026 — Tide Guide (sky-matching palette)

See [../research/06-ui-ux-inspiration.md](../research/06-ui-ux-inspiration.md) for the full catalog.

## The seven core wow moments

1. **Activity-reactive OKLCH palette** — Skiing → icy blue, Surfing → teal ocean, Outdoor → golden hour green, Indoor → warm amber. CSS custom properties on `:root` cross-fade via `transition-colors`. Meta `theme-color` and scrollbar tint follow.
2. **Shader background** — `@paper-design/shaders-react` `<MeshGradient>` reads the palette; animates gently (killed by reduced-motion).
3. **`layoutId` day expansion** — hover / focus on a day card expands it into a full detail panel showing hero weather icon + score breakdown; Motion's FLIP does the shared-element transition.
4. **NumberFlow score ticker** — scores animate up on load, on activity switch, on day change. Uses `tabular-nums`.
5. **Best-day glow** — the top-scoring day for the current activity has `box-shadow: 0 0 40px color-mix(in oklch, var(--activity-primary) 40%, transparent)` and `scale: 1.02`.
6. **⌘K command palette** (`cmdk`) — full-screen search with recent cities (localStorage), popular chips grouped by activity, geolocation button.
7. **View Transitions API** — city changes use React Router v8's built-in support: `navigate(url, { viewTransition: true })`. Router handles feature detection and falls back to instant navigate on unsupported browsers. See [§View Transitions](#view-transitions).

## Palette tokens (in `styles/globals.css`)

Full spec in [05-frontend-architecture.spec.md §OKLCH palette](05-frontend-architecture.spec.md#oklch-palette-per-activity). Key points:

- Four activity palettes each expose `--activity-{name}-primary`, `--activity-{name}-bg-a`, `--activity-{name}-bg-b`.
- `useActivityPalette(activity)` sets the runtime aliases `--activity-primary`, `--activity-bg-a`, `--activity-bg-b`.
- Gradients interpolate in OKLCH via Tailwind v4 syntax: `bg-linear-to-r from-[var(--activity-bg-a)] to-[var(--activity-bg-b)] in-oklch` (the `in-oklch` modifier is the v4-current way; a stale doc might show `/oklch` shorthand — use the modifier form).

## Motion conventions

- **All animations behind `useReducedMotion()`**. Fallbacks:
  - Shader: `speed={0}`
  - NumberFlow: `animated={false}`
  - Particles: `count={0}` (or skip render entirely)
  - `layoutId`: replaced with instant crossfade
  - `motion.div` presets: use `transition-opacity` only, disable transforms

- **Timing**: default duration 200–300 ms; ease `cubic-bezier(0.3, 0, 0, 1)` for entry / expand; ease `cubic-bezier(0.4, 0, 1, 1)` for exit.

- **Layout animations** use `layoutId` for shared elements only. Regular position changes use `layout` prop when appropriate.

## `DayDetail` content

When a `DayCard` expands into `DayDetail`, the panel renders:

- The daily weather code as an animated Meteocons SVG at hero size
- A verbose narrative of the day's forecast (min/max temp, precip prob, wind, cloud)
- The `ScoreBreakdown` component — one horizontal bar per `ScoreComponent`, labeled with weight

The `DailyScore` GraphQL field carries daily aggregates only. An hourly detail view (`morning/noon/evening` heatmap on `DayCard`, hourly sparkline on `DayDetail`) is out of scope for this iteration — it would require an `hourly=…` query on the Weather adapter, an `HourlyWeather` domain type, and an `hourly: [HourlyWeather!]!` field on `DailyScore`. Called out in the README trade-offs as a natural next step.

## Component-by-component

### `SearchForm`
- Real `<label>` (visually hidden but present).
- Autofocus on mount.
- Enter submits; Escape clears; ⌘K opens the CommandPalette overlay.
- On submit, `useTransition` wraps the navigation to keep it feeling instant.

### `CommandPalette` (⌘K)
- Uses `cmdk` under shadcn `<Command>`.
- Sections: **Recent** (localStorage), **Popular for Skiing**, **Popular for Surfing**, **Popular for Outdoor**, **Popular for Indoor**.
- **Use my location** button uses `navigator.geolocation` → reverse geocode via our GraphQL `geocode` query.
- Keyboard: arrow keys navigate, Enter selects, Escape closes.

### `ActivitySwitcher`
- Segmented control, 4 tabs.
- Motion `layoutId="activity-pill"` slides the active-pill background between tabs.
- Icons from Phosphor: `MountainSnow`, `WavyLines`, `Buildings`, `TreePalm` (or best available equivalents).
- On change: fires `useActivityPalette` update, updates URL query (`?activity=SKIING`), triggers score re-animation.

### `ForecastStrip`
- 7 `DayCard`s in a horizontal grid (`grid grid-cols-7 gap-3`), stacked on mobile.
- Best day for the current activity glows.

### `DayCard`
- `motion.div layoutId={"day-" + date}`.
- Content: weekday abbrev, date, Meteocons icon (from `weather_code`), score bar with NumberFlow.
- Hover: subtle `y: -4`, shadow deepen.
- Click / Enter: expands to `DayDetail`.

### `DayDetail`
- Same `layoutId` — Motion morphs the card into a full-width panel.
- See [§DayDetail content](#daydetail-content) above for exact contents.

### `ScoreDisplay`
- `<NumberFlow>` for the big number.
- Gradient bar underneath (`bg-linear-to-r from-red-500 via-yellow-400 to-emerald-500 in-oklch`) clipped to `width: ${score}%`.
- `Tooltip` with the top component explanation.

### `ScoreBreakdown`
- Horizontal bar for each `ScoreComponent`.
- Bar width = `component.value * 100%`, label + weight shown alongside.
- Sorted (already sorted by domain, don't re-sort).

### `WeekSummary`
- One-line summary from `ActivityRankings.summary`.
- Renders in Instrument Serif at ~24 px for that "editorial" feel.
- Frontend cannot and should not distinguish template vs AI-generated — the server returns one string.

### `AmbiguityPicker`
- Vertical list of candidates.
- Each row: `Name, Admin1, Country · population formatted`.
- Arrow keys navigate; Enter selects; click also works.
- On select: `navigate("/city/" + name + "?locationId=" + id)`.

### `NotApplicableCard`
- Used when a scorer returns `notApplicableScore(reason)`.
- Muted styling (opacity 0.5, gray palette override), reason label prominent.
- Not counted in `bestDay` visualization.

### `HeroPreview` (landing)
- Four small activity cards side-by-side with sample data pre-rendered.
- Subtle animation cycles through them highlighting each in turn (kills at reduced-motion).

### `SuggestedCities` (landing)
- Chips: "Chamonix (❄️ Skiing)", "Ericeira (🌊 Surfing)", "Barcelona (☀️ Outdoor)", "London (🏛️ Indoor)".
- Click loads `/city/{name}?activity=X`.

## View Transitions

- Use React Router v8's built-in support: `navigate("/city/" + name, { viewTransition: true })`. Router handles feature detection internally — no manual `document.startViewTransition` wrapper.
- Tag `<h1>` city name with `view-transition-name: hero-city` (CSS) so it animates as a shared element between routes.
- If the browser doesn't support the API, router silently falls back to instant navigation.

## Meta theme-color + scrollbar

- `<meta name="theme-color" id="theme-color-meta">` in `index.html`.
- `useActivityPalette` sets `themeColorMeta.content = getComputedStyle(document.documentElement).getPropertyValue('--activity-primary')`.
- Scrollbar: `html { scrollbar-color: var(--activity-primary) transparent; }` and `::-webkit-scrollbar-thumb { background: var(--activity-primary); }`.

## Loading UX

- Landing → first city load: page-level Suspense fallback = skeleton hero + 4 skeleton activity cards, dimensionally accurate.
- Activity switch after data loaded: no loading state, `useTransition` marks the render as low priority.
- Day expand: `layoutId` FLIP animation only — no additional fetch, no shimmer (all data already in cache from the ranking query).

## Error UX

- `NotFoundEmpty`: "Couldn't find `{query}`. Try one of these:" + SuggestedCities chips.
- `UpstreamDown`: "Weather data is temporarily unavailable. Give it a moment and try again." + Retry button.
- Root ErrorBoundary: "Something went wrong. Please reload." (last-resort).

## Accessibility

Full list in [05-frontend-architecture.spec.md §Accessibility](05-frontend-architecture.spec.md#accessibility-invariants). Highlights:

- `aria-live="polite"` region announces "Showing 7-day forecast for {city}".
- `aria-invalid` + `aria-describedby` on the search input.
- `role="tablist"` / `role="tab"` on ActivitySwitcher with `aria-selected`.
- Focus rings via `focus-visible:ring-2 ring-[var(--activity-primary)] ring-offset-2`.
- All 4 activity icons have text labels visible; never icon-only.
- `prefers-reduced-motion` respected globally, plus in-app opt-in toggle.
- axe-core E2E assertion (see [06-testing-strategy.spec.md](06-testing-strategy.spec.md)).

## Attribution

Footer text (used consistently by frontend and any backend-generated documentation):

> "Weather data by [Open-Meteo](https://open-meteo.com/) · CC-BY 4.0"

Required by their license.

## Rejected alternatives

| Rejected | Chose instead | Why |
|---|---|---|
| Cartoon weather icons | Meteocons | Professional look; matches domain sites (Surfline, OpenSnow) |
| Hero video (mist / skyline) | Shader background | Native, tiny, no bandwidth cost, feels current |
| Full-page parallax scroll | Subtle scale on hover only | Motion sickness risk; no user value |
| Glassmorphism everywhere | Used sparingly on one hero card | Trendy but reads dated if overused |
| Autoplay sound / voiceover | Silent | Universally hated |
| 3D globe (r3f-globe) empty state | Static HeroPreview + SuggestedCities | Reads as "prioritises demo over domain" |
| Redux for palette state | CSS custom properties | Zero JS overhead, `transition-colors` is free |
| Manual number rolling | `@number-flow/react` | Accessibility + perf built in, ~5 KB |
| Custom command palette | `cmdk` | Battle-tested, keyboard perfect out of box |
| Static day cards | Motion `layoutId` expansion | Signature interaction; one screenshot sells the whole app |
