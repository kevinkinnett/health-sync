import { test, expect } from "@playwright/test";
import { collectErrors, significant, stubApi } from "./fixtures.js";

/** The categorical slots validated against the chart surface #171f33. */
const VALIDATED_SLOTS = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#9085e9",
  "#008300",
  "#e66767",
];

/**
 * Five smoke tests, deliberately thin.
 *
 * A broad E2E suite would mostly re-test what the 167 jsdom component
 * tests already cover, at far higher cost and flakiness. These cover only
 * what nothing else can: does the real production bundle boot, resolve
 * its modules, route, and render in a browser.
 *
 * Concretely this is the safety net for the `api/queries` barrel — 11
 * domain modules re-exported from one file. A circular import or a bad
 * re-export typechecks fine, passes every unit test (which import the
 * modules directly under vitest), and breaks only in a real bundle.
 */

test.beforeEach(async ({ page }) => {
  await stubApi(page);
});

test("dashboard boots and renders live data", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");

  // Something from the summary fixture must actually reach the DOM —
  // proves the whole fetch → React Query → render path works.
  await expect(page.getByText("8,432", { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  expect(significant(errors)).toEqual([]);
});

test("every primary route renders without a crash", async ({ page }) => {
  const routes = [
    "/",
    "/readiness",
    "/timeline",
    "/analytics/overview",
    "/analytics/nutrition",
    "/analytics/correlations",
    "/supplements",
    "/medications",
    "/insights",
    "/settings",
    "/api-console",
    "/ingest",
  ];

  for (const route of routes) {
    const errors = collectErrors(page);
    await page.goto(route);
    // The app shell must be present and the root must not be empty —
    // a module-resolution failure renders a blank body. `primary-nav` is
    // the sidebar's own test id, so this asserts the real shell rather
    // than any incidental <nav>.
    await expect(page.locator("#root"), `#root empty on ${route}`).not.toBeEmpty();
    await expect(
      page.getByTestId("primary-nav"),
      `app shell missing on ${route}`,
    ).toBeVisible();
    expect(significant(errors), `console errors on ${route}`).toEqual([]);
  }
});

test("the nutrition screen shows the richer nutrient set", async ({ page }) => {
  // Guards the change that motivated all of this: the Google Health
  // rollup's new columns have to survive shared type → repo → hook →
  // component and actually appear.
  await page.goto("/analytics/nutrition");
  await expect(page.getByText("Last logged day")).toBeVisible({
    timeout: 15_000,
  });
  for (const label of ["Sugar", "Sat Fat", "Sodium", "Cholesterol", "Potassium"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

test("charts actually render marks, not just an empty frame", async ({ page }) => {
  // Guards the charting library itself. A version bump that breaks
  // rendering (or a formatter that throws inside a tooltip) leaves the
  // page structurally fine while the plot area is blank — every other
  // assertion in this file would still pass.
  const errors = collectErrors(page);
  await page.goto("/analytics/nutrition");

  const surface = page.locator(".recharts-surface").first();
  await expect(surface).toBeVisible({ timeout: 15_000 });

  // A rendered line series draws a <path> with real geometry.
  const drawn = await page
    .locator(".recharts-surface path[d]")
    .evaluateAll((nodes) =>
      nodes.filter((n) => (n.getAttribute("d") ?? "").length > 10).length,
    );
  expect(drawn, "no chart paths with geometry were drawn").toBeGreaterThan(0);

  // ...and paints them from the validated palette. Asserted on the real
  // DOM because the palette unit test can only prove what the module
  // exports, not what a component actually hands the chart library.
  const painted = await page
    .locator(".recharts-surface *")
    .evaluateAll((nodes) => {
      const seen = new Set<string>();
      for (const n of nodes) {
        for (const attr of ["stroke", "fill"]) {
          const v = n.getAttribute(attr);
          if (v?.startsWith("#")) seen.add(v.toLowerCase());
        }
      }
      return [...seen];
    });
  const LEGACY = ["#4edea3", "#c0c1ff", "#ffb2b7", "#8083ff", "#ffd479", "#7fd1ff"];
  expect(
    painted.filter((c) => LEGACY.includes(c)),
    "a chart still paints a colour from the retired palette",
  ).toEqual([]);
  expect(
    painted.filter((c) => VALIDATED_SLOTS.includes(c)).length,
    "no validated palette colour reached the DOM",
  ).toBeGreaterThan(0);

  expect(significant(errors)).toEqual([]);
});

test("the timeline runs a before/after report and surfaces its caveat", async ({
  page,
}) => {
  // The whole point of the feature: a result AND the reason to doubt it.
  // If the caveat ever stops rendering, the number becomes misleading.
  const errors = collectErrors(page);
  await page.goto("/timeline");

  await expect(page.getByText("Eight Sleep Pod")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("detected")).toBeVisible();

  await page.getByText("Eight Sleep Pod").click();
  await expect(page.getByText("Weak evidence")).toBeVisible();
  await expect(page.getByText(/too close to separate the two/i)).toBeVisible();
  // Role-scoped: "Time asleep" also appears in the summary sentence above.
  await expect(page.getByRole("cell", { name: /Time asleep/ })).toBeVisible();

  expect(significant(errors)).toEqual([]);
});

test("intervention markers render WITH their labels", async ({ page }) => {
  // A bare dashed line tells you something happened but not what. The
  // label is the entire value of the annotation, and it is the part that
  // silently failed to render on the first deploy.
  const errors = collectErrors(page);
  await page.goto("/analytics/vitals");

  const lines = page.locator(".recharts-reference-line");
  await expect(lines.first()).toBeAttached({ timeout: 15_000 });

  const labels = await page
    .locator(".recharts-reference-line text")
    .allTextContents();
  expect(labels.join(" "), "reference lines drew no label text").toContain(
    "Eight Sleep Pod",
  );
  expect(significant(errors)).toEqual([]);
});

test("client-side navigation works (no full reload, no stale shell)", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.getByRole("link", { name: /readiness/i }).first().click();
  await expect(page).toHaveURL(/\/readiness$/);
  await expect(page.locator("#root")).not.toBeEmpty();
  expect(significant(errors)).toEqual([]);
});

test("renders on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();
  // No horizontal overflow — the layout must fit the viewport.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(significant(errors)).toEqual([]);
});
