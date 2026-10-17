import { test, expect } from "@playwright/test";
import { stubApi } from "./fixtures.js";

/**
 * Layout checks for the UX-audit fixes that jsdom cannot see: wrapping,
 * sticky columns, touch-target size and a crash that must not take the
 * shell down. All measured from the DOM at phone width, never inferred
 * from a screenshot.
 */

const PHONE = { width: 390, height: 844 };
const MIN_TARGET = 24;

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(PHONE);
  await stubApi(page);
});

test("analytics table keeps the date on one line and pinned while scrolling", async ({ page }) => {
  await page.goto("/analytics/activity");
  const table = page.locator("table").filter({ hasText: "2026-07-29" }).first();
  const dateCell = table.locator("tbody tr").first().locator("td").first();
  const numberCell = table.locator("tbody tr").first().locator("td").nth(1);
  await expect(dateCell).toBeVisible();

  const date = await dateCell.evaluate((el) => {
    const style = getComputedStyle(el);
    const lineHeight = parseFloat(style.lineHeight);
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    return { contentHeight: el.getBoundingClientRect().height - padding, lineHeight, position: style.position };
  });
  // One line of text, not "2026-" / "07-29".
  expect(date.contentHeight).toBeLessThan(date.lineHeight * 1.5);
  expect(date.position).toBe("sticky");
  const numberBox = await numberCell.boundingBox();
  const dateBox = await dateCell.boundingBox();
  expect(Math.abs(numberBox!.height - dateBox!.height)).toBeLessThan(2);

  // Scroll the numbers sideways: the date column stays at the left edge
  // of the scroller instead of scrolling out of view.
  const scroller = table.locator("xpath=..");
  const { overflow, left } = await scroller.evaluate((el) => {
    const before = el.getBoundingClientRect().left;
    el.scrollLeft = el.scrollWidth;
    return { overflow: el.scrollWidth - el.clientWidth, left: before };
  });
  // The fixture is wider than a phone, so the sticky path is really exercised.
  expect(overflow).toBeGreaterThan(0);
  const after = await dateCell.boundingBox();
  expect(Math.abs(after!.x - left)).toBeLessThan(1);
});

test("Daily Goals edit button is named and at least 24px", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Edit daily goals" });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(MIN_TARGET);
  expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET);
});

test("Timeline delete is a real target and asks before deleting", async ({ page }) => {
  const deletes: string[] = [];
  await page.route("**/api/interventions/*", async (route) => {
    if (route.request().method() === "DELETE") deletes.push(route.request().url());
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto("/timeline");
  const del = page.getByRole("button", { name: "Delete Eight Sleep Pod" });
  await expect(del).toBeVisible();
  const box = await del.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(MIN_TARGET);
  expect(box!.height).toBeGreaterThanOrEqual(MIN_TARGET);

  await del.click();
  await expect(page.getByText(/This cannot be undone/)).toBeVisible();
  expect(deletes).toHaveLength(0);
  await page.getByRole("button", { name: "Keep" }).click();
  await expect(page.getByText(/This cannot be undone/)).toBeHidden();
  expect(deletes).toHaveLength(0);
});

test("a screen that throws keeps the shell and offers retry", async ({ page }) => {
  // A response-shape drift: the event study arrives without trajectories,
  // which makes RecoveryEventStudy throw during render.
  await page.route("**/api/recovery/event-study**", (route) => route.fulfill({ json: {} }));
  await page.goto("/analytics/correlations");
  await expect(page.getByText("This screen couldn’t be displayed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // Shell survives: the Explore view picker and the bottom nav are still usable.
  await expect(page.getByLabel("Explore health view")).toBeVisible();
  await expect(page.getByTestId("primary-nav")).toBeAttached();
  await page.getByLabel("Explore health view").selectOption("/analytics/activity");
  await expect(page.getByText("This screen couldn’t be displayed")).toBeHidden();
  await expect(page.getByText("2026-07-29").first()).toBeVisible();
});

for (const theme of ["dark", "light"] as const) {
  test(`weekday heatmap labels clear 4.5:1 in ${theme} mode`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("vitalis.theme", t), theme);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/analytics/overview");
    const cells = page.locator("td[title*='weekday average']");
    await expect(cells.first()).toBeVisible();
    const ratios = await cells.evaluateAll((tds) => {
      // Resolve whatever CSS colour syntax the browser reports (color-mix
      // results come back as oklab/color()) to sRGB through a canvas.
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      const rgb = (css: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return tds.map((td) => {
        const style = getComputedStyle(td);
        const a = lum(rgb(style.color));
        const b = lum(rgb(style.backgroundColor));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    });
    expect(ratios.length).toBeGreaterThan(0);
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
  });
}
