import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Linux visual baselines are only meaningful if they are recorded and
 * checked by the SAME Chromium build. That build is fixed by the Playwright
 * image tag, which appears in two places (CI and the local recorder) and
 * has to match the installed @playwright/test. Bump one without the others
 * and every baseline diffs on anti-aliasing alone — or worse, a re-record
 * quietly bakes in a different renderer.
 */
const CLIENT = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(CLIENT, ...p), "utf8");

describe("visual regression image", () => {
  it("is pinned to the installed Playwright version everywhere", () => {
    const installed = JSON.parse(read("node_modules/@playwright/test/package.json")).version;
    const tag = `mcr.microsoft.com/playwright:v${installed}-noble`;

    expect(read("scripts/visualLinux.mjs")).toContain(`"${tag}"`);
    expect(read("..", "..", "..", ".github/workflows/docker.yml")).toContain(`image: ${tag}`);
  });

  it("runs the visual suite in CI", () => {
    const workflow = read("..", "..", "..", ".github/workflows/docker.yml");
    expect(workflow).toMatch(/run: pnpm --filter @health-dashboard\/client e2e:visual\b/);
  });
});
