# 05 — Frontend Architecture

## Purpose

React SPA that consumes the GraphQL API, with a feature-based folder layout, Suspense-first data fetching, and a design system driven by OKLCH tokens that react to the currently selected activity.

## Location: `packages/web/`

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 6 |
| Framework | React 19 |
| Language | TypeScript 5.6+ strict |
| GraphQL client | Apollo Client 3.11+ with `useSuspenseQuery` and fragment masking |
| Type gen | `@graphql-codegen/cli` + client-preset, reads `packages/contracts/schema.graphql` |
| Router | `react-router` v8 declarative mode (v7 `react-router-dom` merged into v8 core) |
| Styling | Tailwind CSS v4 (CSS-first config, OKLCH palette) |
| Components | shadcn/ui (Input, Button, Card, Skeleton, Command, Popover, Tooltip) |
| Animation | Motion (formerly Framer Motion) — `layoutId`, `AnimatePresence`, `useReducedMotion` |
| Icons | Meteocons (weather) via `@iconify/react` + `@iconify-json/meteocons`; Phosphor (activities) via `@phosphor-icons/react` |
| Score ticker | `@number-flow/react` |
| Shader background | `@paper-design/shaders-react` `<MeshGradient>` |
| Command palette | `cmdk` |
| Charts | Recharts v3 — used only for the 7-day daily-score sparkline (input: `rankings.find(r => r.activity === selectedActivity)?.dailyScores`) |
| Particles | `@tsparticles/react` snow / rain preset (behind reduced-motion gate) |
| Fonts | `@fontsource-variable/instrument-serif` + `@fontsource-variable/geist` + `@fontsource-variable/geist-mono` (preloaded in index.html) |
| Errors | `react-error-boundary` (3 levels) |
| Env | Zod-validated module fails fast on boot |
| A11y linting | `eslint-plugin-jsx-a11y` |
| Local state | `useState` + React Context for °C/°F toggle and recent cities |

## Folder layout

```
packages/web/src/
├── app/
│   ├── providers.tsx         # ApolloProvider, ErrorBoundary root, SettingsProvider, ReducedMotionProvider
│   ├── routes.tsx            # /, /city/:name
│   └── main.tsx              # entrypoint
│
├── features/
│   ├── landing/
│   │   ├── landing.page.tsx
│   │   └── components/
│   │       ├── HeroPreview.tsx        # animated 4-activity preview
│   │       └── SuggestedCities.tsx    # clickable chips
│   │
│   └── ranking/
│       ├── ranking.page.tsx
│       ├── queries.ts                 # graphql() operations + fragments
│       ├── hooks/
│       │   ├── useForecast.ts         # useSuspenseQuery + result unwrap
│       │   ├── useCityHistory.ts      # localStorage recent-cities
│       │   ├── useActivityPalette.ts  # sets CSS vars, meta theme-color
│       │   └── useSettings.ts         # °C/°F, reduced-motion opt-in
│       ├── components/
│       │   ├── SearchForm.tsx
│       │   ├── CommandPalette.tsx     # ⌘K
│       │   ├── ActivitySwitcher.tsx   # segmented, Motion layoutId
│       │   ├── ForecastStrip.tsx      # 7 DayCards
│       │   ├── DayCard.tsx            # layoutId="day-{i}"
│       │   ├── DayDetail.tsx          # expanded, same layoutId; shows weather-code hero + score breakdown
│       │   ├── ScoreDisplay.tsx       # NumberFlow + gradient bar
│       │   ├── ScoreBreakdown.tsx     # components rendered as bars
│       │   ├── WeekSummary.tsx        # from ActivityRankings.summary (template or Claude)
│       │   ├── AmbiguityPicker.tsx    # candidates → click
│       │   ├── NotApplicableCard.tsx  # rendered inline in ForecastStrip when score=0 + NA reason
│       │   ├── ForecastSkeleton.tsx
│       │   └── icons/
│       │       ├── weather/           # Meteocons via iconify
│       │       └── activity/          # Ski/Surf/Museum/Park (Phosphor)
│
├── components/
│   ├── ui/                            # shadcn output
│   └── background/
│       └── ActivityShader.tsx         # Paper Shaders MeshGradient
│
├── lib/
│   ├── apollo.ts                      # ApolloClient factory
│   ├── env.ts                         # Zod-validated
│   ├── format.ts                      # temperature (°C/°F), date (city tz)
│   ├── palette.ts                     # OKLCH tokens per activity
│   ├── error-boundary.tsx             # shared fallback UIs
│   ├── assert-never.ts                # exhaustiveness helper for discriminated unions
│   └── suggested-cities.ts            # constants: [{ name, activity, description }]
│
├── gql/                               # graphql-codegen output (gitignored, regen on build)
└── styles/
    └── globals.css                    # @theme with OKLCH palettes + shadcn base
```

## Routing

- `/` → LandingPage (hero + suggested cities)
- `/city/:name` → RankingPage. Query params:
  - `?activity=SKIING|SURFING|OUTDOOR_SIGHTSEEING|INDOOR_SIGHTSEEING` — pre-selected tab. **If absent, default to the top-ranked activity** (`rankings[0].activity` — the highest `overallScore`).
  - `?locationId=…` — skip geocoding (used after ambiguity picker)

Name is URL-encoded (`encodeURIComponent`). No slug DB.

**Activity tab order** in `ActivitySwitcher` is fixed (SKIING, SURFING, OUTDOOR_SIGHTSEEING, INDOOR_SIGHTSEEING) — not the ranking order. Ranking order determines the default selected tab, but the visual order stays stable so muscle memory works across cities.

## Apollo Client config

```ts
new ApolloClient({
  uri: env.VITE_GRAPHQL_ENDPOINT ?? '/graphql',  // same-origin default
  cache: new InMemoryCache({
    typePolicies: {
      Location: { keyFields: ['id'] },
      // ActivityRankings has no stable identity across time (results change every 30 min).
      // Rely on query-var-based caching (Apollo default: identity by field name + args).
      Query: {
        fields: {
          activityRankings: {
            // Normalize by the args so /city/Lisbon and /city/Lisbon?locationId=X are distinct.
            keyArgs: ['cityQuery', 'locationId'],
          },
        },
      },
    },
  }),
  // errorPolicy 'none' (default) — GraphQL top-level errors throw and hit the ErrorBoundary.
  // Domain errors are union members (data, not errors), so this doesn't affect our happy-path union rendering.
  // We do NOT set errorPolicy: 'all' — with useSuspenseQuery + a union-based result type,
  // partial-data semantics conflict with the switch on __typename.
});
```

Pinned version: `"@apollo/client": "^3.13"` (Apollo Client 4 requires migration; sticking with 3.x avoids scope creep). `graphql: "^16"` peer.

## Data fetching pattern

```tsx
export const RankingPage = () => {
  const { name } = useParams<{ name: string }>();          // typed params — name is `string | undefined`
  const [searchParams] = useSearchParams();
  const locationId = searchParams.get('locationId') ?? undefined;   // string | null → string | undefined
  if (!name) throw new Error('city name missing from route');       // narrow name for children
  return (
    <ErrorBoundary FallbackComponent={PageFailure}>
      <Suspense fallback={<ForecastSkeleton />}>
        <ForecastContent cityQuery={name} locationId={locationId} />
      </Suspense>
    </ErrorBoundary>
  );
};

interface ForecastContentProps {
  cityQuery: string;                // narrowed non-optional (name is required by the route)
  locationId?: string;              // truly optional
}

const ForecastContent = ({ cityQuery, locationId }: ForecastContentProps) => {
  // exactOptionalPropertyTypes: spread `locationId` only when it's defined
  const { data } = useSuspenseQuery(ActivityRankingsQuery, {
    variables: { cityQuery, ...(locationId ? { locationId } : {}) },
  });
  const result = data.activityRankings;
  switch (result.__typename) {
    case 'ActivityRankings':          return <RankingView data={result} />;
    case 'AmbiguousLocationError':    return <AmbiguityPicker candidates={result.candidates} query={cityQuery} />;
    case 'CityNotFoundError':         return <NotFoundEmpty query={cityQuery} />;
    case 'UpstreamUnavailableError':  return <UpstreamDown provider={result.provider} />;
    default:                          return assertNever(result);   // exhaustiveness check
  }
};

// lib/assert-never.ts
export function assertNever(x: never): never {
  throw new Error(`Unhandled discriminated-union member: ${JSON.stringify(x)}`);
}
```

Adding a fifth union member to the schema will cause a TS compile error here — that's the point.

## Error boundary strategy (3 levels)

1. **Root** (in `providers.tsx`): catches truly unrecoverable errors (React tree bugs). Shows "Something went wrong" + reload.
2. **Page** (per route): catches page-level errors, allows retry via router reload.
3. **Activity card**: catches activity-specific rendering bugs — displays "Couldn't render this activity" and lets siblings keep working.

Data-level errors (CityNotFound, Ambiguous, UpstreamUnavailable) are **not** errors — they're union payloads rendered explicitly.

## OKLCH palette per activity

`lib/palette.ts` and `styles/globals.css`:

```css
@theme {
  --activity-skiing-primary: oklch(75% 0.08 235);
  --activity-skiing-bg-a:    oklch(96% 0.03 230);
  --activity-skiing-bg-b:    oklch(85% 0.06 240);

  --activity-surfing-primary: oklch(68% 0.13 200);
  --activity-surfing-bg-a:    oklch(92% 0.05 195);
  --activity-surfing-bg-b:    oklch(75% 0.11 205);

  --activity-outdoor-primary: oklch(75% 0.15 90);
  --activity-outdoor-bg-a:    oklch(95% 0.05 85);
  --activity-outdoor-bg-b:    oklch(80% 0.13 100);

  --activity-indoor-primary: oklch(60% 0.10 45);
  --activity-indoor-bg-a:    oklch(93% 0.03 50);
  --activity-indoor-bg-b:    oklch(75% 0.08 40);
}
```

`useActivityPalette(activity)` sets `--activity-primary`, `--activity-bg-a`, `--activity-bg-b` on `document.documentElement` and updates `<meta name="theme-color">`. `transition-colors` on relevant elements handles the fade.

## Env module

```ts
// lib/env.ts
import { z } from 'zod';

// VITE_GRAPHQL_ENDPOINT can be an absolute URL (dev pointing at localhost:4000/graphql)
// or a same-origin relative path (`/graphql` in prod). Use z.string().min(1) with a
// permissive parse — not z.url() — since Zod 4's z.url() rejects relative paths.
const Env = z.object({
  VITE_GRAPHQL_ENDPOINT: z.string().min(1).optional(),
  VITE_UNITS_DEFAULT: z.enum(['metric', 'imperial']).default('metric'),
});
export const env = Env.parse(import.meta.env);
```

Fails fast on boot with a readable error if misconfigured.

## Local state

- **Settings (°C/°F)** via React Context, persisted in `localStorage.wa:units`.
- **Recent cities** stored in `localStorage.wa:recent` (max 10, LRU by last used). Read by ⌘K.
- **Reduced-motion opt-in toggle** in Settings menu (in addition to OS-level `prefers-reduced-motion`).

## Rate-limit handling (429 responses)

Backend applies 60 req/60s per IP globally. Frontend must not blow through this:

- **CommandPalette typeahead**: debounce the `geocode` query at **300 ms** and cancel in-flight on new input. Uses `useDeferredValue` + a wrapping `useTransition` so React 19 keeps the input responsive during pending queries.
- **On 429 from Apollo**: `useSuspenseQuery` throws an `ApolloError`; the enclosing `ErrorBoundary` renders a `RateLimitedNotice` component ("Too many requests — try again in a few seconds") with a retry button that respects `Retry-After` if present in `error.networkError.response.headers`.
- **Union-payload semantics**:
  - Domain errors (`CityNotFoundError`, `AmbiguousLocationError`, `UpstreamUnavailableError`) come back as **data**, not errors — `useSuspenseQuery` does NOT throw, `data.activityRankings.__typename` distinguishes them.
  - Only HTTP failures (429, 5xx) and transport errors throw and hit the ErrorBoundary.
  - Because of this, `errorPolicy` stays at the default (`'none'`) — see Apollo Client config above. `'all'` would surface partial-data + error together, which conflicts with a single-union-payload result.

## Suspense composition

- Page-level Suspense triggers on first city query.
- Skeleton **matches real card dimensions exactly** — zero CLS.
- Suspense boundary is inside ErrorBoundary so `useSuspenseQuery` throws are caught cleanly.

## Fragment masking

Every component that reads a field declares its own fragment:

```ts
export const RankingViewFragment = graphql(`
  fragment RankingViewFragment on ActivityRankings { rankings { ...RankingCardFragment } summary }
`);
```

Parent hydrates via `useFragment(fragment, rankings)` — a component only sees the fields it declared. Refactor-safe.

## Testing

- Unit tests with `@testing-library/react` for components: `SearchForm`, `ScoreDisplay`, `AmbiguityPicker`, hooks.
- Integration: MSW-mocked GraphQL in `@testing-library` for `RankingPage` union branches.
- E2E: Playwright — see [06-testing-strategy.spec.md](06-testing-strategy.spec.md).

## Accessibility invariants

- `<label>` on every input, never placeholder-only.
- Focus rings visible (`focus-visible:ring-2 ring-offset-2`).
- Tap targets ≥ 24×24 CSS px (WCAG 2.2 SC 2.5.8).
- `aria-live="polite"` region announces "Showing forecast for {city}" on load.
- `aria-invalid` + `aria-describedby` on form inputs.
- Keyboard: Tab through form, Enter submits, Escape clears search. Arrow-keys navigate `AmbiguityPicker` and `CommandPalette`.
- All animations gated by `useReducedMotion()`.

## Rejected alternatives

| Rejected | Chose instead | Why |
|---|---|---|
| Next.js | Vite SPA | No SSR value here; Vite is lighter and faster to iterate |
| urql / TanStack Query + graphql-request | Apollo Client | JD says "GraphQL"; Apollo is the recognised default and pairs with Suspense |
| Redux / Zustand | Apollo cache + Context | Server state = Apollo; UI state trivial |
| CSS-in-JS (Emotion, styled-components) | Tailwind v4 + `@theme` tokens | Zero runtime; OKLCH built-in; fastest builds |
| Chakra / MUI | shadcn/ui | Copy-paste ownership; matches Tailwind; smaller surface |
| Framer Motion legacy | Motion (successor) | Same API, better perf, actively developed |
| `axios` on frontend | Apollo Client only | Only one HTTP boundary; no reason for a second client |
| Redux Toolkit Query | Apollo Client | Duplicates Apollo's job for GraphQL |
