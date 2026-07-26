import { describe, it, expect } from "vitest";
import { analyzeNavItems, navSections } from "../components/Layout";

/**
 * The audit's complaint was that 22 screens mirrored the database rather
 * than the questions people ask, so the sidebar was regrouped into
 * Trends / Experiments / Log.
 *
 * The regroup is only safe if it is a pure REARRANGEMENT. A screen that
 * quietly stops appearing in the sidebar is unreachable — its route still
 * resolves, so nothing errors and no other test notices. These assertions
 * are the guard against exactly that.
 */

const sidebarPaths = navSections.flatMap((s) => s.items.map((i) => i.to));

describe("navigation grouping", () => {
  it("every analytics screen appears in the sidebar exactly once", () => {
    for (const item of analyzeNavItems) {
      const hits = sidebarPaths.filter((p) => p === item.to);
      expect(hits, `${item.label} (${item.to}) should appear once`).toHaveLength(1);
    }
  });

  it("no route is listed twice anywhere in the sidebar", () => {
    expect(new Set(sidebarPaths).size).toBe(sidebarPaths.length);
  });

  it("keeps the top-level screens reachable", () => {
    for (const path of [
      "/",
      "/readiness",
      "/timeline",
      "/supplements",
      "/medications",
      "/ingest",
      "/api-console",
      "/settings",
      "/insights",
    ]) {
      expect(sidebarPaths, `${path} missing from the sidebar`).toContain(path);
    }
  });

  it("groups by question, not by data source", () => {
    const headers = navSections.map((s) => s.header).filter(Boolean);
    expect(headers).toEqual(["Trends", "Experiments", "Log"].concat("System"));
  });

  it("puts the relationship-finding surfaces together", () => {
    // Correlations, AI Insights and the Timeline report were three
    // separate answers to "what affects what". Splitting them across the
    // nav is what made them feel like overlapping features.
    const experiments = navSections.find((s) => s.header === "Experiments");
    expect(experiments?.items.map((i) => i.to)).toEqual([
      "/timeline",
      "/analytics/correlations",
      "/insights",
    ]);
  });

  it("keeps each logged domain with its own trend view", () => {
    const log = navSections.find((s) => s.header === "Log");
    const paths = log?.items.map((i) => i.to) ?? [];
    expect(paths).toContain("/supplements");
    expect(paths).toContain("/analytics/supplements");
    expect(paths).toContain("/medications");
    expect(paths).toContain("/analytics/medications");
  });

  it("distinguishes a logging screen from its trend view by label", () => {
    const labels = navSections
      .find((s) => s.header === "Log")
      ?.items.map((i) => i.label);
    expect(labels).toContain("Supplement Log");
    expect(labels).toContain("Supplement Trends");
  });
});
