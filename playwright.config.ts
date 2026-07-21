import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './test-cases',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'http://localhost:4321',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // firefox and webkit temporarily excluded — both show a timing-related
    // flake where the click event fires before the page's module scripts
    // finish attaching listeners. Not yet root-caused. See TESTING.md.
  ],

  /* Run the real built Worker before starting the tests — NOT `astro dev`.
   * `astro dev` uses Vite's dev server, which does not correctly load
   * Durable Object classes (see DECISIONS.md / the ContactRateLimiter
   * investigation) — bindings show as present but calling them throws
   * "no such actor class" at runtime. `npm run build` produces the real
   * dist/server/entry.mjs (patched by scripts/fix-durable-objects.mjs to
   * correctly export the DO class), and `wrangler dev` serves that exact
   * build through the real Workers runtime, same as production. */
  webServer: {
    command: 'npm run build && npx wrangler dev --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000, // build + wrangler cold start is slower than plain `astro dev`
  },
});