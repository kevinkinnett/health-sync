import { test, expect } from "@playwright/test";
import { collectErrors, significant, stubApi } from "./fixtures.js";

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
