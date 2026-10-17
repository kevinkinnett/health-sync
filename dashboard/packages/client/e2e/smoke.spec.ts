import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect, type Page } from "@playwright/test";
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

/**
 * Every routed path in App.tsx. Kept literal (rather than derived) so a
 * failure names the route, and checked against App.tsx by the test below so
 * a new screen cannot be added without being swept.
 */
const ROUTES = [
  "/",
  "/readiness",
  "/timeline",
  "/analytics/overview",
  "/analytics/activity",
  "/analytics/sleep",
  "/analytics/heart-rate",
  "/analytics/hrv",
  "/analytics/weight",
  "/analytics/exercises",
  "/analytics/vitals",
  "/analytics/eight-sleep",
  "/analytics/sensors",
  "/analytics/unusual-days",
  "/analytics/nutrition",
  "/analytics/records",
  "/analytics/correlations",
  "/analytics/supplements",
  "/analytics/medications",
  "/supplements",
  "/medications",
  "/recovery",
  "/insights",
  "/settings",
  "/api-console",
  "/ingest",
  "/alerts",
];

/**
 * Icons whose ligature didn't fire. The icon font is a SUBSET
 * (scripts/subsetIcons.mjs); an icon missing from it doesn't error — its
 * NAME ("monitor_heart") renders as a run of text instead. A glyph is
 * roughly one em square; the fallback text is several em wide.
 */
async function iconsRenderedAsText(page: Page): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready);
  return page.locator(".material-symbols-outlined:visible").evaluateAll((nodes) =>
    nodes
      .map((n) => ({
        name: (n.textContent ?? "").trim(),
        ratio: n.getBoundingClientRect().width / parseFloat(getComputedStyle(n).fontSize),
      }))
      .filter((icon) => icon.name && icon.ratio > 1.5)
      .map((icon) => icon.name),
  );
}

test("the route sweep covers every route App.tsx registers", () => {
  const app = readFileSync(
    fileURLToPath(new URL("../src/App.tsx", import.meta.url)),
    "utf8",
  );
  const registered = new Set<string>();
  for (const [, path] of app.matchAll(/<Route\s+path="([^"]+)"/g)) {
    // Redirects and the analytics parent (its index redirects), not screens.
    if (path === "*" || path === "/explore" || path === "/analytics") continue;
    registered.add(path.startsWith("/") ? path : `/analytics/${path}`);
  }
  expect([...registered].filter((r) => !ROUTES.includes(r)).sort()).toEqual([]);
});

test("every route renders, and is still standing once its data lands", async ({ page }) => {
  for (const route of ROUTES) {
    const errors = collectErrors(page);
    await page.goto(route);
    // The app shell must be present and the root must not be empty —
    // a module-resolution failure renders a blank body. `primary-nav` is
    // the sidebar's own test id, so this asserts the real shell rather
    // than any incidental <nav>.
    await expect(page.locator("#root"), `#root empty on ${route}`).not.toBeEmpty();
    await expect(page.getByTestId("primary-nav"), `app shell missing on ${route}`).toBeVisible();

    // Then WAIT FOR THE DATA. Checking right after first paint was a race
    // the test always won: the shell paints before any query resolves, and
    // a crash in something rendered from a dependent query (the recovery
    // event study, two requests deep) arrived after the assertions had
    // already passed. Network idle means every query, including the
    // chained ones, has answered and been rendered.
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/Loading view…/)).toHaveCount(0);

    // A render crash either unmounts the shell (no error boundary) or is
    // caught by one, which still reports it to the console — so between
    // them these two assertions see it either way.
    await expect(page.getByTestId("primary-nav"), `app shell gone after data on ${route}`).toBeVisible();
    expect(significant(errors), `console errors on ${route}`).toEqual([]);
    expect(await iconsRenderedAsText(page), `icons rendered as text on ${route}`).toEqual([]);
  }
});

test("the sleep screen draws every stage", async ({ page }) => {
  // Four stacked stage series plus the moving average. A stage that stops
  // drawing leaves the chart looking plausible — the stack is just shorter
  // — so count the series that drew, not the chart.
  const errors = collectErrors(page);
  await page.goto("/analytics/sleep");

  const card = page.getByRole("heading", { name: "Sleep Stages" }).locator("..");
  await expect(card.locator(".recharts-bar-rectangle").first()).toBeAttached({ timeout: 15_000 });

  // Polled: bars grow in over the entrance animation, so a single early
  // read can catch rectangles that exist but have no height yet.
  const stages = () =>
    card.locator(".recharts-bar").evaluateAll((groups) =>
      groups.map((g) => {
        const rects = [...g.querySelectorAll(".recharts-rectangle")];
        return {
          drawn: rects.filter((r) => (r.getAttribute("d") ?? "").length > 10).length,
          fill: (rects[0]?.getAttribute("fill") ?? "").toLowerCase(),
        };
      }),
    );
  await expect
    .poll(async () => (await stages()).map((s) => s.drawn >= 10), {
      message: "every stage series should draw a bar for each of the 10 nights",
    })
    .toEqual([true, true, true, true]);
  const fills = (await stages()).map((s) => s.fill);
  expect(new Set(fills).size, `two stages share a colour: ${fills.join(", ")}`).toBe(4);

  await expect
    .poll(
      () =>
        card
          .locator(".recharts-line-curve")
          .evaluateAll((nodes) => nodes.filter((n) => (n.getAttribute("d") ?? "").length > 10).length),
      { message: "the moving average drew no line" },
    )
    .toBe(1);

  expect(significant(errors)).toEqual([]);
});

test("the exercise screen draws training load by type", async ({ page }) => {
  // This route used to white-screen under the stub: /health/training-load
  // had no fixture, `days.length` was read off `[]`, and nothing visited it.
  const errors = collectErrors(page);
  await page.goto("/analytics/exercises");

  // One strength day and one cardio day in the fixture. Polled, because
  // bars have no height until the entrance animation runs.
  await expect
    .poll(
      () =>
        page
          .locator(".recharts-bar .recharts-rectangle")
          .evaluateAll((nodes) => nodes.filter((n) => (n.getAttribute("d") ?? "").length > 10).length),
      { message: "training load drew no bars", timeout: 15_000 },
    )
    .toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("cell", { name: "Weights" })).toBeVisible();

  expect(significant(errors)).toEqual([]);
});

test("the recovery event study renders its session timeline", async ({ page }) => {
  // Its fixture was dead for as long as it existed: the stub's pattern was
  // anchored with `$` and the client always sends a query string. Assert on
  // what only the event-study payload can produce.
  const errors = collectErrors(page);
  await page.goto("/analytics/correlations");

  const study = page.locator('section[aria-labelledby="event-study-title"]');
  await expect(study.getByText("Individual observation")).toBeVisible({ timeout: 15_000 });
  await expect(study.getByText("1 eligible event · 4/10 matched pairs")).toBeVisible();
  await expect(study.getByRole("combobox", { name: "Event session" })).toHaveValue("2026-07-25");

  await expect
    .poll(
      () =>
        study
          .locator(".recharts-line-curve")
          .evaluateAll((nodes) => nodes.filter((n) => (n.getAttribute("d") ?? "").length > 10).length),
      { message: "the session trajectory drew no line" },
    )
    .toBeGreaterThanOrEqual(1);

  expect(significant(errors)).toEqual([]);
});

test("the nutrition screen distinguishes coverage, missing days, and provisional data", async ({ page }) => {
  // Guards the change that motivated all of this: the Google Health
  // rollup's new columns have to survive shared type → repo → hook →
  // component and actually appear.
  await page.goto("/analytics/nutrition");
  await expect(page.getByText("Last logged day")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("83%")).toBeVisible();
  await expect(page.getByText("Today is provisional")).toBeVisible();
  await expect(page.getByText(/Missing food logs remain unknown/i)).toBeVisible();
  for (const label of ["Sugar", "Saturated fat", "Sodium", "Cholesterol", "Potassium"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});

test("the weight screen preserves raw observations and avoids causal claims", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/analytics/weight");

  await expect(page.getByText("Weight observations and trend")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("2026-07-24 at 07:05")).toBeVisible();
  await expect(page.getByText("2026-07-24 at 19:20")).toBeVisible();
  await expect(page.getByText("5 total observations")).toBeVisible();
  await expect(page.getByText(/not causation/i)).toBeVisible();
  await expect(page.getByText(/context, not proof of an effect/i)).toBeVisible();

  expect(significant(errors)).toEqual([]);
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

  const list = page.getByTestId("intervention-list");
  await expect(list.getByText("Eight Sleep Pod")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("detected")).toBeVisible();

  await list.getByText("Eight Sleep Pod").click();
  await expect(page.getByText("Observed change", { exact: true })).toBeVisible();
  await expect(page.getByText("Limited estimate confidence", { exact: true })).toBeVisible();

  // The report leads with the effect-size plot, so "which of these moved"
  // is a glance rather than a scan of the table below it.
  await expect(page.getByTestId("effect-size-plot")).toBeVisible();

  // And the overlap view is what makes the caveat legible: two bars that
  // visibly abut, rather than a sentence you have to hold in your head.
  await expect(page.getByTestId("intervention-gantt")).toBeVisible();
  await expect(page.getByText(/too close to separate the two/i)).toBeVisible();
  // Role-scoped: "Time asleep" also appears in the summary sentence above.
  await expect(page.getByRole("cell", { name: /Time asleep/ })).toBeVisible();

  expect(significant(errors)).toEqual([]);
});

test("the heart rate screen reports weighted zone minutes", async ({ page }) => {
  // This screen rendered an empty donut and three zeroes for seven weeks:
  // active-zone-minutes was captured raw but nothing rolled it into the
  // columns the page reads, and nothing anywhere asserted otherwise.
  const errors = collectErrors(page);
  await page.goto("/analytics/heart-rate");

  // 59 fat-burn + 26 cardio over 2 days -> (59 + 2*26) / 2 = 56 AZM/day.
  // Asserting the WEIGHTED figure, because the plain minute sum (43) is what
  // the card used to show under the same label.
  await expect(page.getByTestId("hr-azm-per-day")).toHaveText(/56 AZM\/day/, {
    timeout: 15_000,
  });
  await expect(page.getByText("43 min/day in zone")).toBeVisible();
  await expect(page.getByTestId("hr-zone-empty")).toHaveCount(0);

  expect(significant(errors)).toEqual([]);
});

test("the home screen asks whether anything you changed worked", async ({ page }) => {
  // The engine behind this shipped and went unseen for weeks, because the
  // only route in was a sidebar noun ("Timeline") with the verdict two
  // clicks further down. The fix is that the question now gets asked where
  // the day starts — so it is the HOME screen this asserts on.
  const errors = collectErrors(page);
  await page.goto("/");

  const card = page.getByTestId("did-it-work");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("Eight Sleep Pod");
  await expect(card).toContainText("Sleep efficiency");
  await expect(card).toContainText("+11.2");

  // A number without its caveat is worse than no number here.
  await expect(card).toContainText("Limited estimate confidence");

  // The verdict with nothing to report must say so rather than vanish.
  await expect(card).toContainText("Nothing moved meaningfully");

  // And it must land on the ANSWER, not on a list to search. Asserting the
  // report itself, not the intervention's name — the name is on the
  // timeline list whether or not the deep link selected anything, so it
  // would pass with the ?intervention= handling ripped out.
  await card.getByRole("link", { name: /Eight Sleep Pod/ }).click();
  await expect(page).toHaveURL(/\/timeline\?intervention=1$/);
  await expect(page.getByRole("cell", { name: /Time asleep/ })).toBeVisible({
    timeout: 15_000,
  });

  expect(significant(errors)).toEqual([]);
});

test("the activity chart draws both measures on separate scales", async ({ page }) => {
  // It shipped as a single plot with two y-scales (steps 0-18k on the left,
  // minutes 0-160 on the right), both series in the same blue. Where those
  // lines crossed was an artefact of the scale ratio, not the data.
  const errors = collectErrors(page);
  await page.goto("/analytics/activity");

  await expect(page.getByTestId("panel-Steps")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("panel-Active minutes")).toBeVisible();

  // Two plots, not one.
  await expect(page.locator(".recharts-wrapper")).toHaveCount(2);

  // Both actually drew, and in DIFFERENT colours — the specific defect was
  // two measures sharing one hue.
  const painted = await page
    .locator(".recharts-area-area, .recharts-line-curve")
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => (n.getAttribute("d") ?? "").length > 10)
        .map((n) => (n.getAttribute("stroke") ?? n.getAttribute("fill") ?? "").toLowerCase()),
    );
  expect(painted.length, "the panels drew no geometry").toBeGreaterThanOrEqual(2);
  expect(new Set(painted).size, "both measures painted the same colour").toBeGreaterThan(1);

  expect(significant(errors)).toEqual([]);
});

test("the HRV chart draws the deep sleep series", async ({ page }) => {
  // Google publishes no equivalent of Fitbit's deepRmssd, so the column went
  // NULL at the cutover and this line quietly stopped drawing while Daily
  // RMSSD carried on — the chart looked fine. jsdom cannot catch that
  // (ResponsiveContainer is zero-sized there, so nothing renders and the
  // legend entry appears with or without data); only a real browser can.
  const errors = collectErrors(page);
  await page.goto("/analytics/hrv");

  const surface = page.locator(".recharts-surface").first();
  await expect(surface).toBeVisible({ timeout: 15_000 });

  // Each <Line> gets its own .recharts-line group. Count the ones that drew
  // a curve with real geometry: daily, deep, and the 7-day average.
  const drawnSeries = await page
    .locator(".recharts-line .recharts-line-curve")
    .evaluateAll((nodes) =>
      nodes.filter((n) => (n.getAttribute("d") ?? "").length > 10).length,
    );
  expect(drawnSeries, "the deep sleep line drew no geometry").toBeGreaterThanOrEqual(3);

  // ...and the honesty note, since the fixture window spans the change.
  await expect(page.getByTestId("hrv-source-caveat")).toBeVisible();
  const marker = await page
    .locator(".recharts-reference-line text")
    .allTextContents();
  expect(marker.join(" ")).toContain("source change");

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

test("a dossier opens as a keyboard-contained reference drawer", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/supplements");
  await page.getByRole("button", { name: "Library" }).click();

  const trigger = page.getByRole("button", {
    name: "View Magnesium glycinate dossier",
  });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Magnesium glycinate" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("A well-tolerated form of supplemental magnesium.")).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Magnesium fact sheet/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close dossier" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(significant(errors)).toEqual([]);
});

test("notification settings protect unsaved delivery changes", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/settings");

  const push = page.getByRole("switch", { name: "Enable push notifications" });
  await expect(push).toBeVisible({ timeout: 15_000 });
  await push.click();

  await expect(page.getByTestId("notif-sev-warn")).toBeDisabled();
  await expect(page.getByTestId("notif-test")).toBeDisabled();

  const endpoint = page.getByLabel("Apprise endpoint");
  await endpoint.fill("not-a-url");
  await expect(page.getByText("Enter a complete Apprise URL.")).toBeVisible();
  await expect(page.getByTestId("notif-save")).toBeDisabled();

  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(push).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("notif-sev-warn")).toBeEnabled();
  expect(significant(errors)).toEqual([]);
});
