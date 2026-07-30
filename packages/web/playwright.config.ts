import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config. Deterministic backend via OPEN_METEO_MODE=stub (fixtures
 * shipped with the server). Two web servers (backend + frontend) started by
 * Playwright — CI reuses nothing, local dev reuses if already running.
 * See specs/06-testing-strategy.spec.md §Playwright.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env['CI'] ? 2 : 0,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Uses stub adapters (see packages/server/src/adapters/outbound/open-meteo/stubs)
      // so tests are deterministic and run offline.
      command: 'pnpm --filter @wa/server dev:mock',
      url: 'http://localhost:4000/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @wa/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
});
