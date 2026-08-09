import { describe, it, expect } from "vitest";
import { analyzeNavItems, navSections } from "../components/navigation";

const primaryPaths = navSections.flatMap((section) => section.items.map((item) => item.to));

describe("navigation grouping", () => {
  it("keeps primary navigation short and free of duplicate routes", () => {
    expect(new Set(primaryPaths).size).toBe(primaryPaths.length);
    expect(primaryPaths.length).toBeLessThanOrEqual(11);
  });

  it("keeps every top-level workflow reachable", () => {
    for (const path of [
      "/",
      "/readiness",
      "/timeline",
      "/analytics/overview",
      "/analytics/correlations",
      "/supplements",
      "/medications",
      "/ingest",
      "/api-console",
      "/settings",
      "/insights",
    ]) {
      expect(primaryPaths, `${path} missing from primary navigation`).toContain(path);
    }
  });

  it("moves deep metric destinations into the Explore picker", () => {
    const deepViews = analyzeNavItems.filter((item) => item.to.startsWith("/analytics/"));
    expect(deepViews.length).toBeGreaterThan(10);
    expect(primaryPaths).not.toContain("/analytics/activity");
    expect(primaryPaths).not.toContain("/analytics/sleep");
  });

  it("groups the product around user intentions", () => {
    expect(navSections.map((section) => section.header).filter(Boolean)).toEqual([
      "Explore",
      "Changes",
      "Log",
      "System",
    ]);
  });

  it("keeps relationship-finding surfaces together", () => {
    const changes = navSections.find((section) => section.header === "Changes");
    expect(changes?.items.map((item) => item.to)).toEqual([
      "/timeline",
      "/analytics/correlations",
      "/insights",
    ]);
  });
});
