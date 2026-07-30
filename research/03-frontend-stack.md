# Frontend Stack — Best Practices (2026)

React + TypeScript + GraphQL for a minimal-but-polished city-input + 7-day-forecast + activity-ranking UI.

---

## 1. React setup in 2026

### Landscape
- **Vite** remains React team's recommended tool for SPA. Fast HMR. Build-time env baking.
- **Next.js** — production-scale default when SSR/RSC/edge matter across many routes.
- **React Router v7** — merged Remix; framework mode on top of Vite with loaders/actions/SSR.
- **TanStack Start** — still RC in mid-2026; powerful but riskier.

### Recommendation
**Pick: Vite + React 19 + TypeScript (SPA, client-only).**
- Zero framework surface area.
- Fast scaffolding: `npm create vite@latest -- --template react-ts`.
- Use `react-router-dom` v7 in *declarative* mode if you want `/city/:name` deep-link.

### React 19 features worth using

| Feature | Use here? | Why |
|---|---|---|
| **Actions + `useActionState`** | Yes — city submit form | Replaces manual `loading/error/data` triplets |
| **`useFormStatus`** | Optional | `<SubmitButton>` knows parent form status without prop-drilling |
| **`useOptimistic`** | Skip | Read-only forecast |
| **`use()` + Suspense** | Yes with `useSuspenseQuery` | Cleanest loading semantics |
| **`ref` as prop** | Free win | Focus mgmt without `forwardRef` |
| **Document Metadata** | Yes (1 line) | `<title>{city} · Forecast</title>` inline |
| **Server Components** | No | Client-only SPA |

---

## 2. GraphQL client

### Landscape (2026 rough tiers)
- **Apollo Client** (~6M weekly) — normalized cache, devtools, Suspense hooks (`useSuspenseQuery`, `useBackgroundQuery`, `useReadQuery`), React 19 ready.
- **urql** (~2M) — modular, document cache default; normalized cache via `@urql/exchange-graphcache` opt-in.
- **TanStack Query + graphql-request** — no GraphQL-specific caching; generic query cache.
- **Relay** — best for large fragment-first graphs; heavy setup.
- **graphql-request alone** — no cache; only as the fetcher inside TanStack Query.

### Recommendation
**Pick: Apollo Client 3.11+ with `useSuspenseQuery`.**
- One import, `ApolloProvider`, done.
- Devtools instantly recognizable.
- Suspense-native path pairs with React 19 `<Suspense>` + error boundaries.
- Normalized cache means repeat city queries are instant.
- Set `errorPolicy: 'all'` at client level so partial results still render.

**Runner-up: urql + `@urql/exchange-graphcache` + client-preset codegen.** Choose if bundle size matters or the JD hints at custom cache behavior.

---

## 3. Type generation from GraphQL schema

### Options
- **`@graphql-codegen/cli` + `@graphql-codegen/client-preset`** — canonical 2026 setup. Typed `graphql()` tag returning `TypedDocumentNode<Result, Variables>`. Fragment masking on by default.
- **gql.tada** — no codegen loop; `ts-plugin` derives types live from an introspected schema. Delightful DX; still niche.
- **Pothos code-first (backend)** + SDL export + codegen on client → single source of truth.

### Recommendation
**Pick: `graphql-codegen` client-preset.**

```ts
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';
export default {
  schema: 'http://localhost:4000/graphql',
  documents: ['src/**/*.{ts,tsx}', '!src/gql/**'],
  generates: {
    './src/gql/': { preset: 'client', presetConfig: { fragmentMasking: true } },
  },
} satisfies CodegenConfig;
```

Then in components:
```ts
import { graphql } from '@/gql';
const ForecastQuery = graphql(`query Forecast($city: String!) { forecast(city: $city) { ... } }`);
```

**Type sharing across FE/BE:** define the schema with **Pothos** (code-first). SDL is your contract; client codegens from that same SDL.

---

## 4. Styling

### Landscape
- **Tailwind v4** — CSS-first config, Oxide engine (~100× faster builds), OKLCH colors. Safe default.
- **Panda CSS** — type-safe zero-runtime CSS-in-JS; growing rapidly. Best when tokens/multi-brand theming matter.
- **vanilla-extract** — solid but more setup.
- **CSS Modules** — acceptable, but under-signals.

### Component primitives
- **shadcn/ui** — copy-paste ownership, Tailwind-native, zero runtime. Top pick.
- **Radix** — headless primitives underneath shadcn.
- **Ark UI** — Chakra team's headless option, pairs with Panda.
- **MUI** — heavy; wrong choice for a minimal demo.

### Recommendation
**Pick: Tailwind v4 + shadcn/ui, add ~4 components:**
- `Input`, `Button` — search form
- `Card` — one per forecast day
- `Skeleton` — loading state

Bonus: `Command` + `Popover` for a "recent cities" autocomplete.

Setup:
```bash
pnpm add tailwindcss @tailwindcss/vite
pnpm add -D @types/node
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add input button card skeleton
```

---

## 5. State management

### Rules of thumb
- **Server state → GraphQL client cache (Apollo)** — don't reinvent caching.
- **URL state → React Router** — city name in `?city=` or `/city/:name`.
- **Local UI state → `useState`/`useReducer`.**
- **Cross-tree shared UI state → Context** (theme, °C/°F toggle).
- **Zustand only when** you have frequent updates + many selective subscribers, or need `localStorage` persistence non-trivially.

### Recommendation
**Pick: Apollo cache + `useState` + one `SettingsContext` for °C/°F. No Zustand.**

If asked: "Server state lives in Apollo's normalized cache; there is no client state that would benefit from a global store."

---

## 6. Data-fetching UX patterns

### Modern senior 2026 pattern
1. **Suspense as the loading primitive** — `useSuspenseQuery` (Apollo) or `use(promise)`.
2. **Error boundary per data region**, not one at the app root. Use **`react-error-boundary`**.
3. **Skeletons, not spinners** — prevent layout shift.
4. **Empty state with copy + action** ("Try 'London' or 'Tokyo'").
5. **Retry button** on error — `resetErrorBoundary()` or Apollo's `refetch()`.
6. **`errorPolicy: 'all'`** so partial results render.
7. **Debounced input** for autocomplete (300ms).

### Composition pattern
```tsx
<ErrorBoundary FallbackComponent={ForecastError} onReset={reset}>
  <Suspense fallback={<ForecastSkeleton />}>
    <Forecast city={city} />
  </Suspense>
</ErrorBoundary>
```

---

## 7. Accessibility basics

- **Real `<label>` for the city input** — never rely on `placeholder`.
- **Semantic HTML**: `<form>`, `<button type="submit">`, `<main>`, `<section>`, proper `<h1>`/`<h2>` hierarchy.
- **Visible focus ring** with ≥3:1 contrast (`focus-visible:ring-2`).
- **Tap targets ≥24×24 CSS px** (WCAG 2.2 SC 2.5.8).
- **`aria-live="polite"`** region for "Loading forecast for {city}…" and errors.
- **`aria-invalid` + `aria-describedby`** on inputs.
- **Keyboard**: Tab through form → results; Enter submits; Escape clears; arrow keys navigate combobox.
- **Autofocus** the input on load.
- **`prefers-reduced-motion`** on skeleton pulse.
- **Enable `eslint-plugin-jsx-a11y`** (`recommended`).
- **`lang="en"` on `<html>`**.

---

## 8. Folder structure

Feature-based layout (Bulletproof React style):

```
src/
├── app/                    # providers, router, root layout
│   ├── providers.tsx       # ApolloProvider, ErrorBoundary root
│   └── main.tsx
├── features/
│   └── forecast/
│       ├── components/
│       │   ├── SearchForm.tsx
│       │   ├── ForecastGrid.tsx
│       │   ├── ForecastDayCard.tsx
│       │   ├── ActivityRanking.tsx
│       │   └── ForecastSkeleton.tsx
│       ├── queries.ts      # graphql() operations, fragments
│       ├── hooks.ts        # useForecast, useCityHistory
│       └── types.ts
├── components/             # cross-feature UI
│   └── ui/                 # shadcn output
├── lib/
│   ├── apollo.ts           # client factory
│   └── format.ts           # temp/date helpers
├── gql/                    # graphql-codegen output
└── styles/globals.css
```

### Principles
- **Co-locate** by default. Move up only when 2+ features share it.
- Each feature exports **public API via `index.ts`**.
- **Colocate tests** next to source.
- Never a `hooks/` or `utils/` dumping ground at the root.

---

## 9. Environment config

### Vite reality
- Only `VITE_`-prefixed vars are exposed via `import.meta.env`.
- Values statically replaced at build time — no secrets here.
- `import.meta.env.DEV`, `.PROD`, `.MODE`, `.BASE_URL` are built-in.

### Senior touches
```ts
// src/lib/env.ts
const schema = z.object({
  VITE_GRAPHQL_ENDPOINT: z.string().url(),
  VITE_WEATHER_UNITS: z.enum(['metric', 'imperial']).default('metric'),
});
export const env = schema.parse(import.meta.env);
```

- Commit `.env.example` listing all `VITE_*` vars.
- For runtime config, `window.__ENV` injected by HTML at container start.

---

## 10. Polish details

1. **Skeleton that mirrors exact forecast card layout** (not a generic grey bar).
2. **`react-error-boundary` per data region + "Try again" button**.
3. **Empty state with example cities as chips** ("London", "Tokyo", "São Paulo").
4. **Typed env with Zod validation**.
5. **`useActionState` on submit form** — React 19 fluency.
6. **Autofocus input; Enter submits; Escape clears**.
7. **Unit toggle (°C/°F) persisted in localStorage** via Context.
8. **`aria-live` region** announcing "Showing forecast for {city}".
9. **Dynamic `<title>{city} · 7-day forecast</title>`** via React 19 document metadata.
10. **Prefetch on focus / debounced autocomplete** with `Command` combobox.

### Anti-patterns
- Redux for this app.
- One giant root `ErrorBoundary`.
- Spinners where skeletons belong.
- `any` anywhere.
- `useEffect(fetch...)` in 2026.
- Untyped `import.meta.env` scattered.
- Placeholder-only inputs.

---

## Final consolidated stack

| Layer | Pick | Runner-up |
|---|---|---|
| Bundler / framework | **Vite + React 19 (SPA)** | React Router v7 framework mode |
| Language | **TypeScript 5.6+ (strict)** | — |
| GraphQL client | **Apollo Client + `useSuspenseQuery`** | urql + graphcache |
| Type gen | **graphql-codegen client-preset** | gql.tada |
| Styling | **Tailwind v4** | Panda CSS |
| UI primitives | **shadcn/ui (4 components)** | Ark UI |
| Router | **react-router-dom v7 declarative** (if deep-linking) | — |
| Server state | **Apollo cache** | TanStack Query |
| Client state | **`useState` + Context for units** | Zustand for `recentCities` |
| Loading | **Suspense + skeletons** | manual `loading` boolean |
| Errors | **`react-error-boundary` per region + retry** | Apollo `error` prop |
| Env | **Zod-validated typed env module** | raw `import.meta.env` |
| A11y | **`eslint-plugin-jsx-a11y` + real labels + focus-visible + aria-live** | axe-core in tests |
| Folder | **feature-based** | flat `components/` |
| Testing | **Vitest + Testing Library** | see testing doc |
| Docs | **README with decisions + trade-offs + "next steps"** | — |

---

## Sources
- https://react.dev/blog/2024/12/05/react-19
- https://www.apollographql.com/docs/react/data/suspense
- https://the-guild.dev/graphql/codegen/plugins/presets/preset-client
- https://ui.shadcn.com/docs/installation/vite
- https://vite.dev/guide/env-and-mode
