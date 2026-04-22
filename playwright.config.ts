import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for smoke tests only.
 *
 * Smokes run against a local dev/build server (`npm run dev` unless
 * PLAYWRIGHT_BASE_URL is set pointing at a deployed preview) and
 * cover the critical user-visible surfaces: the map loads at all,
 * and the sign-in page renders. Everything deeper (auth callbacks,
 * incident creation) is left to unit + integration tests because
 * those are faster and don't need a running Supabase.
 *
 * One project (Chromium) is enough for smokes; add Firefox/WebKit
 * only if we start seeing engine-specific regressions.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Skip the webServer when pointing at a deployed preview — the
  // CI pipeline sets PLAYWRIGHT_BASE_URL to the Vercel preview URL
  // and the server is already up.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
