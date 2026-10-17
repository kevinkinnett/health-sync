import { test, expect } from "@playwright/test";
import { stubApi } from "./fixtures.js";

/**
 * The theme mechanism in a real browser, against the production bundle:
 * the pre-paint script, the stored choice, and the toggle. jsdom covers
 * the store's logic; only a browser can show the CSS tokens actually
 * switch and that the mode is decided before the bundle runs.
 */

const bodyBackground = () => getComputedStyle(document.body).backgroundColor;

test("follows the OS preference before the bundle loads", async ({ page }) => {
  await stubApi(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The inline <head> script has run; the module bundle may not have.
  expect(await page.evaluate(() => document.documentElement.className)).toContain("light");
  expect(await page.evaluate(bodyBackground)).toBe("rgb(238, 240, 243)");
});

test("a stored choice beats the OS, and the toggle persists across reloads", async ({ page }) => {
  await stubApi(page);
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("vitalis.theme", "dark");
      sessionStorage.setItem("seeded", "1");
    }
  });
  await page.goto("/");
  expect(await page.evaluate(bodyBackground)).toBe("rgb(13, 15, 18)");

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  expect(await page.evaluate(bodyBackground)).toBe("rgb(238, 240, 243)");
  expect(await page.locator('meta[name="theme-color"]').getAttribute("content")).toBe("#eef0f3");

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
  expect(await page.evaluate(() => localStorage.getItem("vitalis.theme"))).toBe("light");
});

test("settings offers system, light and dark", async ({ page }) => {
  await stubApi(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/settings");
  const group = page.getByRole("radiogroup", { name: "Theme" });
  await expect(group.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
  await group.getByRole("radio", { name: /Light/ }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await group.getByRole("radio", { name: /System/ }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
