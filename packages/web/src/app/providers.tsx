import { ApolloProvider } from '@apollo/client';
import { MotionConfig } from 'motion/react';
import type { PropsWithChildren } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { SettingsProvider, useSettings } from '../features/ranking/hooks/useSettings.js';
import { createApolloClient } from '../lib/apollo.js';

const apolloClient = createApolloClient();

/**
 * Root-level ErrorBoundary — catches truly unrecoverable errors (React tree
 * bugs). Page-level boundaries handle Apollo failures per route.
 */
function RootFailure({ error }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-serif text-4xl">Something went wrong</h1>
      <p className="mt-4 text-neutral-700">{message}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-6 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm"
      >
        Reload
      </button>
    </main>
  );
}

/**
 * Wraps children in Motion's `MotionConfig` with a reduced-motion policy that
 * respects BOTH the OS `prefers-reduced-motion` media query AND the in-app
 * toggle. `"always"` when the user explicitly opts in via Settings; `"user"`
 * (OS-only) otherwise. Every `motion.*` component in the tree — HowItWorks
 * cards, DayCard hover, DayDetail overlay, ActivitySwitcher pill, shader,
 * NumberFlow — inherits this without needing a per-component check.
 */
function ReducedMotionGate({ children }: PropsWithChildren) {
  const { reducedMotion } = useSettings();
  return <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>{children}</MotionConfig>;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary fallbackRender={RootFailure}>
      <ApolloProvider client={apolloClient}>
        <SettingsProvider>
          <ReducedMotionGate>{children}</ReducedMotionGate>
        </SettingsProvider>
      </ApolloProvider>
    </ErrorBoundary>
  );
}
