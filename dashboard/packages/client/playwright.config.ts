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
  reporter: process.env.CI
    ? [
        ["line"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  expect: {
    toHaveScreenshot: {
      /*
       * A small tolerance, not zero. Anti-aliasing on curves and text
       * differs by a pixel or two between runs on the same machine, and a
       * zero-tolerance baseline fails on that noise until someone learns
       * to ignore the suite — which is worse than not having it.
       *
       * 0.5% of the area is far below any real change: a series that
       * stops drawing, a colour swap, or a label that disappears all move
       * a much larger fraction than that.
       */
      /*
       * Tight on purpose, and this took a mutation test to get right.
       *
       * At 0.005 (0.5% of the area) the suite MISSED a real defect: two
       * series repainted the same hue. A 1.5px stroke across a card is
       * only ~0.27% of its pixels, so the change fell under the ratio —
       * and the 18%-opacity fill beneath it fell under the default
       * per-pixel `threshold` of 0.2, so those pixels weren't even
       * counted as different. A tolerance bigger than the defect is a
       * suite that reports green while the bug ships.
       *
       * 0.001 is ~500px on these cards, still enough to absorb
       * anti-aliasing jitter, and `threshold` is dropped so a subtle
       * recolour registers at all. Verified both ways: the same mutation
       * now fails, and two clean runs pass.
       */
      maxDiffPixelRatio: 0.001,
      threshold: 0.1,
      /*
       * NOT `animations: "disabled"`.
       *
       * That option freezes Recharts' entrance animation part-drawn rather
       * than finishing it, and because the freeze is deterministic the
       * result is a STABLE but WRONG baseline — a half-drawn series that
       * five consecutive runs agreed on. A baseline that reproducibly
       * captures the wrong thing is worse than none: it locks in the
       * defect and passes forever.
       *
       * `animations` DEFAULTS to "disabled" in toHaveScreenshot, so simply
       * omitting it is not enough — it has to be turned back on. Combined
       * with the settle() wait in visual.spec.ts, this captures the chart
       * as a person actually sees it.
       */
      animations: "allow",
      scale: "css",
    },
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
