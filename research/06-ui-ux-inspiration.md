# UI/UX Inspiration & "Wow Moments" (2026)

For the weather activity ranker. Goal: senior-level polish, not gimmicks.

Stack context: React 19 + Vite + TypeScript + Apollo Client + Tailwind v4 + shadcn/ui.

---

## TL;DR — the "must-have" wow stack

If you build these seven items well, you have a top-tier submission:

1. **Activity-reactive OKLCH palette + shader background** — `@paper-design/shaders-react` `<MeshGradient>` with palette that swaps on activity change.
2. **NumberFlow animated scores** — `@number-flow/react`, ~5 KB, respects reduced-motion.
3. **`layoutId` shared-element expansion** — day card morphs into full hourly-detail panel (Motion).
4. **Meteocons animated SVG icons** — everywhere weather is shown. Never Lucide's default cloud.
5. **View Transitions API for city switching** — one-line browser-native crossfade.
6. **Best-day glow** on the 7-day strip for the selected activity.
7. **`prefers-reduced-motion` gate applied globally** via `useReducedMotion()` hook.

---

## Reference sites — key patterns to steal

### Apple Weather
- Thousands of hand-tuned background variations mapping to sun position, cloud cover, precip.
- "Big number + supporting modules" layout — hero temperature, stacked cards below.
- SF Pro Display at ~96px+ for the hero number.

### Windy.com
- Timeline scrubber for scrubbing through days — score animates live.

### Surfline
- **Signature pattern**: 3-slot morning/noon/evening micro-heatmap per day. Copy for your app.
- 7-point rating scale with color coding (blue "poor" → green "epic").

### OpenSnow / OnTheSnow / Snow-Forecast
- "Best day right now" prominent leaderboard.
- Elevation-tiered forecasts (top/mid/bottom).
- Comparison tables ("Where's the most new snow today").

### Nomad List
- Filter-chip row as primary control.
- Dense scannable cards with tiny score bars per attribute.

### Kayak Explore / Google Flights Explore
- Filter destinations by temp range, activity, budget.
- Empty state = suggested destination chips grouped by attribute.

### Tomorrow.io
- One-line AI-style summary: _"This week Lisbon is best for outdoor sightseeing (85) on Wed; skip surfing — swell flat."_ Even template-rendered reads intelligent.

### Sky-matching palettes
- Weather apps that shift the background palette with conditions (Carrot Weather, Weather Line, Mercury Weather) — the whole app feels like the weather. Exact vibe target.

---

## UX pattern catalog

### Dynamic backgrounds — three tiers

| Tier | Tech | Notes |
|---|---|---|
| **S** | CSS-only mesh gradient (Tailwind v4 `bg-conic`, `bg-radial-[at_25%_25%]`, `bg-linear-to-r/oklch`) | Zero JS, native reduced-motion respect |
| **M** | `@paper-design/shaders-react` `<MeshGradient>` — up to 10 colors, distortion/swirl/speed/grain props | Kill via `speed={0}` when reduced-motion |
| **M** | `tsParticles` snow/rain presets | React wrapper first-class |
| **L** | react-three-fiber + drei + postprocessing | Only if everything else already polished |

### Activity switcher
- **Animated pill** with Motion `layoutId="activityIndicator"` — sliding pill effect via FLIP.
- **Palette swap** — CSS vars set on `:root`, interpolate via `transition-colors`. Uses Tailwind v4 `@theme`.
- **Meta theme-color** also swaps (see below).

### Score visualization — tasteful trifecta
1. **NumberFlow ticker** for the numeric score (~5 KB, respects reduced-motion).
2. **Score bar with OKLCH gradient fill** — `bg-linear-to-r/oklch from-red-500 via-yellow-400 to-emerald-500`, `width: ${score}%`.
3. **7-day sparkline** at the top for the selected activity — Recharts `<AreaChart>` with linear OKLCH gradient stop, ~40 LOC.

Optional: **radial ring** (Apple Fitness style) — impressive but suggests multi-metric.

### Multi-day forecast
- **7-day horizontal card strip** — Surfline pattern.
- **Hover/focus expands to hourly detail** via Motion `layoutId` — card grows into full-detail panel.
- Alternative: **calendar heatmap** (7 columns × 4 rows, one per activity).

### City search UX
- **Full-screen overlay** — Vercel/Linear/Raycast style using `cmdk` library.
- **⌘K to open** — power-user signal.
- Content: cycling animated placeholder, recent chips, popular chips grouped by activity ("Best for skiing right now"), geolocation button.
- Persist recent cities in localStorage.

### Ambient / data-reactive UI
- Cross-fade background palette on day selection.
- Best day gets `box-shadow: 0 0 40px 0 color-mix(in oklch, var(--activity-primary) 40%, transparent)` + subtle `scale: 1.02`.

### Loading states
- Motion ships a skeleton shimmer example.
- shadcn/ui `<Skeleton>` canonical primitive.
- **Match skeleton dimensions exactly** — avoids amateurish CLS jump.
- Use React 19 `<Suspense>` with Apollo `useSuspenseQuery`.

### Empty state
- Animated hero showing 4 activities as tabs with placeholder city preloaded, scores animating.
- Suggested city chips grouped by "best for" activity.
- Optional: `r3f-globe` with pulsing dots for popular cities (high effort, high reward).

### Micro-interactions
- NumberFlow for count-up animations.
- Hover: card lifts 2–4px, shadow deepens, best-day glow intensifies.
- Focus: `focus-visible:` variants — never strip outline.
- Tooltip on score: shadcn/ui `<Tooltip>` with justification ("clear skies, mild wind, 22°C — ideal").

---

## Libraries — verified 2026 picks

### Animation
- **Motion (formerly Framer Motion)** — default. ~16 KB. `layoutId`, `AnimatePresence`, gestures.
- Motion One only if shaving bytes matters.
- GSAP overkill.

### 3D / canvas
- **react-three-fiber + drei + postprocessing** — for globe/immersive scene.
- **tsParticles** — snow, rain, confetti presets.
- **@paper-design/shaders-react** — zero-dep WebGL shaders. `MeshGradient` for ambient background. Also `Water`, `Waves`, `Warp`, `Halftone`, `Dithering`.

### Charts
- **Recharts v3** — default. `<AreaChart>` + linear OKLCH gradient stop = premium sparkline in 40 LOC.
- Tremor only for prebuilt dashboard blocks.
- visx/Nivo skip.

### Icons
- **Lucide** for UI (search, chevron, etc.).
- **Meteocons** for weather (500+ hand-crafted animated SVG). Install `@iconify-json/meteocons` with `@iconify/react`.
- **Never use Lucide `<Cloud />` for weather** — amateur giveaway.

### Fonts (verified 2026 pairings)
- **UI / body**: Geist Sans (Vercel) — neutral, technical, matches shadcn/ui.
- **Display / hero score**: Instrument Serif — contemporary, sharp serifs, distinctive italic.
- **Numeric**: `font-variant-numeric: tabular-nums;` on all score displays.
- **Mono**: Geist Mono for dates/coordinates.

Recommended pairing: **Instrument Serif hero + Geist Sans UI + Geist Mono meta**.

### Backgrounds
- `@paper-design/shaders-react` — technical choice.
- **Aceternity UI Aurora Background** — Tailwind v4 CSS keyframes.
- **Magic UI** — 110+ components, various backgrounds.
- **shadcn.io backgrounds** — 100+ including canvas rain.

### View Transitions API
- Cross-browser (Chrome, Edge, Safari 18+).
- `document.startViewTransition(() => setState(...))` — one line to cross-fade whole SPA state.
- Tag shared elements with `view-transition-name: my-card`.
- React Router integration: `viewTransition` prop on `<Link>`, `<NavLink>`, `<Form>`.

### NumberFlow
- Dependency-free, ~5 KB.
- Respects `prefers-reduced-motion` by default.
- `Intl.NumberFormat` formatting.

### OKLCH tooling
- Tailwind v4 palette is OKLCH by default; gradients interpolate in OKLCH via `bg-linear-to-r/oklch`.
- [oklch.net](https://oklch.net/) for picker/converter.

---

## Ranked "wow moments" to build

| # | Wow moment | Tech | Cx |
|---|---|---|---|
| 1 | **Activity-reactive OKLCH palette + shader background** — Skiing→icy-blue, Surfing→teal-ocean, Indoor→warm amber, Outdoor→golden-hour green | CSS vars + `@paper-design/shaders-react` MeshGradient + Tailwind v4 `@theme` | S–M |
| 2 | **`layoutId` score expansion** — day card morphs into hourly-detail panel | Motion `layoutId` + `AnimatePresence` | S |
| 3 | **NumberFlow score ticker** on data load and day/activity switch | `@number-flow/react` | XS |
| 4 | **Best-day glow** on 7-day strip for current activity | `box-shadow` + `color-mix(in oklch, ...)` + Motion `animate={{ scale: [1, 1.02, 1] }}` | XS |
| 5 | **Meteocons animated SVG icons** everywhere | `@iconify-json/meteocons` + `@iconify/react` | XS |
| 6 | **Full-screen `cmdk` command palette on ⌘K** | `cmdk` + shadcn `<Command>` + Motion overlay + scroll-lock | S |
| 7 | **View Transitions API for city change** | `document.startViewTransition()` + `view-transition-name` on hero elements | XS |
| 8 | **Dynamic `<meta name="theme-color">` + tinted scrollbar** | `useEffect` sets `<meta>` on activity change; `::-webkit-scrollbar-thumb { background: var(--activity-primary) }` | XS |
| 9 | **Surfline-style morning/noon/evening micro-heatmap** per day card | Three flex divs, OKLCH gradient bg | S |
| 10 | **AI-style one-line week summary** at top | Template rendered from scored data | XS |
| 11 | **`prefers-reduced-motion` hook applied globally** | Motion `useReducedMotion()` + `<ReducedMotionProvider>` context swapping shader speed, particle count, NumberFlow `animated` | S |
| 12 | **Weather-condition particle overlay** — snow if snowing, drizzle if raining | tsParticles low-density preset, z-index below content, opacity 0.3, `pointer-events: none` | S |
| 13 | **7-day sparkline** at top for selected activity | Recharts `<AreaChart>` + OKLCH `<linearGradient>` fill | S |
| 14 | **`useSuspenseQuery` + matching-shape skeletons** | Apollo + React 19 `<Suspense>` + skeletons sized identically | S |
| 15 | **r3f-globe empty state** with pulsing dots for popular cities | `r3f-globe` + drei `OrbitControls` | L |

Build 1–14 well = top-tier. Skip 15 unless ahead of schedule.

---

## Accessibility & taste guardrails

### `prefers-reduced-motion` is table stakes
- Progressive opt-in: apply animation inside `@media (prefers-reduced-motion: no-preference)`, not the other way.
- Motion's `useReducedMotion()` hook → conditionally set `speed={0}` on shaders, `animated={false}` on NumberFlow, `count={0}` on tsParticles, skip `layoutId` FLIP.
- Preserve opacity fades / short transitions — motion-sensitive users still benefit from feedback.
- Provide a user-facing toggle too.

### Contrast in ambient backgrounds
- OKLCH mesh gradients can wash out text. Always render text on `bg-black/40 backdrop-blur-sm` scrim card or use `text-shadow` — guarantee 4.5:1 contrast.
- Test with axe/Lighthouse against darkest and lightest palette states.

### Motion-sickness triggers to avoid
- Auto-panning parallax with fast movement.
- Continuous full-viewport rotation.
- Autoplay video loops.
- Rapid color oscillation / flashing (WCAG 2.3.1: <3 flashes/sec).

### Keyboard & screen reader
- Every animation has a semantic fallback (numeric score is real text, not canvas-only).
- Command palette: `role="combobox"`, focus-trap, ESC-to-close.
- Live regions (`aria-live="polite"`) on score cards for screen reader announcements on activity switch.

---

## Anti-patterns (senior reviewer cringe list)

1. **Glassmorphism everywhere** — use once, purposefully.
2. **Cartoon weather icons** (smiling sun with sunglasses).
3. **Hero video with mist/skyline** — cliché, kills LCP.
4. **Autoplay sound/voiceover** — never.
5. **Full-viewport parallax on scroll** — dated.
6. **Anti-design "chaos" without structure**.
7. **Excessive 3D "because we can"**.
8. **Animation without purpose** — remove entrance animations that fire on every render.
9. **Neon cyber palettes**.
10. **Cluttered dashboard density** — you have 4 activities, show less/larger.
11. **Default Lucide `<Cloud />` in hero** — immediate amateur signal.
12. **`transition-all duration-300` everywhere** — be intentional.
13. **Skeleton loaders that don't match real dimensions** — CLS jump.
14. **Hardcoded hex mid-file** — everything through `@theme` design tokens.
15. **`localStorage.setItem("city", …)` on every keystroke** — debounce.
16. **Missing focus-visible states** — fastest way to fail a11y rubric.

---

## Architecture recommendation

```
/src
  /components
    /background            → <ActivityShader speed={reduce ? 0 : 0.5} palette={activity.oklch} />
    /activity-switcher     → segmented control w/ Motion layoutId="activityPill"
    /forecast-strip        → 7 <DayCard>, best day glows
    /day-card              → collapsed state, layoutId="day-{i}"
    /day-detail            → expanded state, same layoutId, hourly Recharts
    /score                 → <NumberFlow /> + gradient bar + tooltip
    /command-palette       → cmdk + shadcn Command, ⌘K
    /hero-summary          → templated one-liner
  /hooks
    /useReducedMotionSafe  → wraps Motion's useReducedMotion, exposes derived flags
    /useActivityPalette    → returns OKLCH tokens + sets CSS vars + meta theme-color
    /useCity               → Apollo useSuspenseQuery
  /styles
    /theme.css             → @theme with activity palettes in OKLCH
  /lib
    /scoring.ts            → pure functions: (forecast, activity) => 0..100
```

Key notes:
- Score functions pure and unit-tested (Vitest/Jest).
- Apollo `useSuspenseQuery` + React 19 `<Suspense>` for automatic skeleton-swap.
- Every animated component reads `useReducedMotionSafe()`.
- One CSS custom property drives everything: `--activity-primary` changes → shader colors, glow, meta-theme, scrollbar, gradient bars all update via CSS variable interpolation.

---

## Sources
- https://motion.dev/docs/react-layout-animations
- https://number-flow.barvian.me/
- https://shaders.paper.design/mesh-gradient
- https://meteocons.com/
- https://cmdk.paco.me
- https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
- https://ui.aceternity.com/components/aurora-background
- https://www.pkgpulse.com/guides/recharts-v3-vs-tremor-vs-nivo-react-charting-2026
- https://tailwindcss.com/blog/tailwindcss-v4
- https://evilmartians.com/chronicles/exploring-the-oklch-ecosystem-and-its-tools
- https://blog.openreplay.com/prefers-reduced-motion-accessible-animation/
