import { describe, it, expect } from "vitest";
import { analyzeNavItems } from "../components/navigation";

/**
 * The desktop sidebar's "Analyze" section and the in-page pill strip
 * on `<AnalyticsLayout>` used to keep two parallel arrays of the same
 * routes. They silently drifted on at least one feature addition.
 *
 * Both are now derived from `analyzeNavItems`. This test asserts the
 * invariant the audit flagged: every analytics sub-route in the shared
 * constant resolves to a unique relative path so the pill strip can
 * generate stable links via `to.split("/").pop()`.
 */
describe("Analytics sub-nav source-of-truth", () => {
  it("every shared item under /analytics/* has a unique trailing segment", () => {
    const trailing = analyzeNavItems
      .filter((i) => i.to.startsWith("/analytics/"))
      .map((i) => i.to.replace(/^\/analytics\//, ""));
    const unique = new Set(trailing);
    expect(unique.size).toBe(trailing.length);
    // And there's at least one item (regression-guard against
    // somebody emptying the array accidentally).
    expect(trailing.length).toBeGreaterThan(5);
  });

  it("the AI Insights entry lives at /insights, not under /analytics/", () => {
    // Intentional — Insights crosses every domain and isn't a normal
    // metric sub-screen. The sub-nav filters it out via the same
    // prefix check tested above.
    const aiInsights = analyzeNavItems.find((i) => i.label === "AI Insights");
    expect(aiInsights?.to).toBe("/insights");
  });
});
