import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests.
 *
 * Deliberately runs against the PRODUCTION BUNDLE (`vite build` + `vite
 * preview`), not the dev server. The whole point is to exercise things
 * jsdom component tests and `tsc` cannot: real module resolution and
 * chunking (the `api/queries` barrel re-exports 11 domain modules — a
 * circular import or a bad re-export shows up here and nowhere else),
 * real routing, real rendering.
 *
 * The API is stubbed at the browser boundary (see e2e/fixtures.ts), so
 * this needs no server and no database — it stays deterministic and can
 * run in CI. Server behaviour is covered separately by the supertest
 * suites and the createApp boot test.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Build first so we test the real bundle, not a dev-server transform.
    command: "pnpm build && pnpm exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
