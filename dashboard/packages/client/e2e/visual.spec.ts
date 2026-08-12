import { test, expect, type Page } from "@playwright/test";
import { stubApi } from "./fixtures.js";

/**
 * Visual regression over the charts.
 *
 * These exist because of a specific, repeated failure: three chart bugs
 * shipped in a fortnight that were VISUAL and invisible to every other
 * kind of test. Intervention labels that drew nothing (the DOM was fine).
 * Two unrelated measures painted the same blue (the DOM was fine). A panel
 * that rendered blank because an axis had height={0} (the DOM was fine).
 * Each one was caught by a human looking at a picture.
 *
 * A pixel diff catches all three, and nothing else in the suite does.
 *
 * KNOWN WEAKNESS, found by mutation-testing this file: a pixel diff is
 * least sensitive exactly where charts are most transparent. Recolouring
 * an area whose fill sits at 0.18 opacity moved only 539 pixels — its
 * 1.5px stroke — because the fill itself changed by less than the
 * per-pixel colour threshold. It is caught, but with little margin. The
 * complementary net is the DOM-level assertion in smoke.spec.ts that the
 * two activity measures paint DIFFERENT colours, which does not care about
 * opacity at all. Neither check alone is sufficient; keep both.
 *
 * SCOPE: the chart CARD, never the whole page. A full-page baseline breaks
 * whenever any unrelated copy changes, and a suite that cries wolf gets
 * ignored — which costs more than it saves.
 *
 * UPDATING: when a change to a chart is intended, re-record with
 *   pnpm exec playwright test visual --update-snapshots
 * and eyeball the diff in the report before committing the new PNG. The
 * baseline is a review artifact, not a lockfile.
 *
 * PLATFORM: Playwright suffixes baselines per-platform (…-win32.png).
 * These were recorded on Windows; a Linux CI would record its own on
 * first run rather than failing against these.
 */

/**
 * Recharts animates its series in on mount, driven by requestAnimationFrame
 * rather than CSS, so Playwright cannot fast-forward it. Its default
 * duration is 1500 ms; this waits past that.
 *
 * Learned the hard way: with `animations: "disabled"` the entrance freezes
 * PART-DRAWN and stays there, so the baselines recorded a half-drawn
 * series that five straight runs agreed on. Deterministically wrong.
 */
const ANIMATION_MS = 1800;

async function ready(page: Page, path: string): Promise<void> {
  await stubApi(page);
  await page.goto(path);
  // Fonts are bundled with the app, so this stays network-independent while
  // still waiting out the layout pass before the first frame is captured.
  await page.evaluate(() => document.fonts.ready);
}

/** Wait out the entrance animation so the capture is the settled chart. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(ANIMATION_MS);
}

test.describe("chart appearance", () => {
  test("activity — two panels, one hue each", async ({ page }) => {
    // The regression this locks: both series in the same blue, on two
    // y-scales. Colour and layout are the entire content of that bug.
    await ready(page, "/analytics/activity");
    const card = page.getByTestId("panel-Steps").locator("..");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(card).toHaveScreenshot("activity-chart.png");
  });

  test("hrv — deep sleep series and the source-change marker", async ({ page }) => {
    // The regression this locks: a whole series silently not drawing.
    await ready(page, "/analytics/hrv");
    const card = page
      .getByRole("heading", { name: "Heart Rate Variability (RMSSD)" })
      .locator("..");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(card).toHaveScreenshot("hrv-chart.png");
  });

  test("heart rate zones — donut, cards and stacked bars", async ({ page }) => {
    await ready(page, "/analytics/heart-rate");
    const card = page.getByTestId("hr-azm-per-day").locator("../../..");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(card).toHaveScreenshot("hr-zones.png");
  });

  test("vitals — intervention markers WITH their labels", async ({ page }) => {
    // The regression this locks: reference lines drawing with no caption.
    // The fixture deliberately spans the Eight Sleep intervention date.
    await ready(page, "/analytics/vitals");
    const card = page
      .getByRole("heading", { name: "Blood Oxygen (SpO2)" })
      .locator("..");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(card).toHaveScreenshot("nutrition-annotated.png");
  });

  test("sensor comparison — evidence card and night drill-down", async ({ page }) => {
    await ready(page, "/analytics/sensors");
    const card = page
      .getByRole("heading", { name: "Main sleep duration" })
      .locator("xpath=ancestor::article");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(card).toHaveScreenshot("sensor-agreement-card.png");

    await card.getByText("Largest gaps in this window").click();
    await card.getByRole("button", { name: /2026-07-25/ }).click();
    const detail = page.getByRole("dialog", { name: /Wake date Jul 25, 2026/ });
    await expect(detail).toBeVisible();
    await expect(detail).toHaveScreenshot("sensor-night-detail.png");
  });

  test("home — the did-it-work card", async ({ page }) => {
    await ready(page, "/");
    const card = page.getByTestId("did-it-work");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(card).toHaveScreenshot("did-it-work.png");
  });

  test("home — the goal rings card keeps its own bounds", async ({ page }) => {
    // The regression this locks: `h-full` on a card stacked with siblings
    // inside a grid cell resolved to the whole ROW height, so the card grew
    // to several hundred empty pixels and pushed its ring out of the bottom
    // over the stat tiles below. Nothing in the DOM was wrong — only the
    // rendered box — so a pixel diff is the only thing that can see it.
    await ready(page, "/");
    const card = page.getByTestId("daily-goals");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(card).toHaveScreenshot("daily-goals.png");
  });

  test("home — the stat tiles", async ({ page }) => {
    // Targets the CARD by its own testid. The first version of this test
    // used getByText("TOTAL STEPS").locator("../..") which resolves to the
    // header ROW, not the tile — so it silently excluded the number and
    // the sparkline, and sailed through a change that replaced the whole
    // sparkline. A baseline scoped to the wrong element is worse than none:
    // it reports green over the very thing it was added to watch.
    await ready(page, "/");
    const tile = page.getByTestId("stat-card").first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(tile).toHaveScreenshot("stat-tile.png");
  });

  test("timeline — the overlap bars", async ({ page }) => {
    await ready(page, "/timeline");
    const gantt = page.getByTestId("intervention-gantt");
    await expect(gantt).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(gantt).toHaveScreenshot("intervention-gantt.png");
  });

  test("report — the day-by-day panels", async ({ page }) => {
    // Observable Plot, so unlike the Recharts cards these also have real
    // jsdom coverage. The pixel diff still earns its place: it is the only
    // check on layout, on the changepoint rule landing in the right place,
    // and on the two level lines being distinguishable.
    await ready(page, "/timeline");
    await page
      .getByTestId("intervention-list")
      .getByText("Eight Sleep Pod")
      .click();
    const panels = page.getByTestId("metric-series-panels");
    await expect(panels).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(panels).toHaveScreenshot("metric-series-panels.png");
  });

  test("report — the effect size plot", async ({ page }) => {
    await ready(page, "/timeline");
    await page
      .getByTestId("intervention-list")
      .getByText("Eight Sleep Pod")
      .click();
    const plot = page.getByTestId("effect-size-plot");
    await expect(plot).toBeVisible({ timeout: 15_000 });
    await settle(page);
    await expect(plot).toHaveScreenshot("effect-size-plot.png");
  });
});
