import { describe, it, expect } from "vitest";
import {
  computeCorrelationPairs,
  fillMissingDays,
  seriesFrom,
  type MetricSeries,
  type PairSpec,
} from "../services/correlationEngine.js";

/**
 * Pure unit tests for the correlation engine — the registry/spec
 * machinery that replaced the hand-written pair blocks. The statistical
 * core (pearson) has its own behavior pinned via stats.ts; here we pin
 * the JOIN semantics: lag shifting, overlap gating, label/insight
 * wording, and point dating.
 */

function makeSeries(
  key: string,
  days: [string, number][],
  label = key,
  noun = key,
): MetricSeries {
  return { key, label, noun, values: new Map(days) };
}

function dates(n: number, startDay = 1): string[] {
  return Array.from({ length: n }, (_, i) =>
    `2026-05-${String(startDay + i).padStart(2, "0")}`,
  );
}

function registryOf(...series: MetricSeries[]): Map<string, MetricSeries> {
  return new Map(series.map((s) => [s.key, s]));
}

describe("computeCorrelationPairs", () => {
  it("joins same-day pairs on overlapping dates, points ascending and dated", () => {
    const ds = dates(12);
    const reg = registryOf(
      makeSeries("a", ds.map((d, i) => [d, i]), "A label", "a noun"),
      makeSeries("b", ds.map((d, i) => [d, i * 2]), "B label", "b noun"),
    );
    const [pair] = computeCorrelationPairs(reg, [{ x: "a", y: "b" }]);
    expect(pair).toBeDefined();
    expect(pair.points.length).toBe(12);
    expect(pair.points[0]).toEqual({ x: 0, y: 0, date: "2026-05-01" });
    expect(pair.points[11].date).toBe("2026-05-12");
    expect(pair.correlation).toBe(1); // perfectly linear
    expect(pair.spearman).toBe(1);
    expect(pair.confidenceInterval).toEqual({ low: 1, high: 1 });
    expect(pair.stability).toBe("mixed"); // fewer than 18 observations
    expect(pair.adjustedPValue).toBe(1); // too short for a shift-based null
    expect(pair.notableAfterCorrection).toBe(false);
    expect(pair.xLabel).toBe("A label");
    expect(pair.yLabel).toBe("B label");
    expect(pair.lagDays).toBe(0);
  });

  it("lag-1 pairs sample y the day AFTER x, and date points by the x day", () => {
    // y(D+1) = x(D) exactly → r must be 1 at lag 1.
    const ds = dates(12);
    const reg = registryOf(
      makeSeries("drive", ds.map((d, i) => [d, 10 + i]), "Drive", "time in car"),
      makeSeries(
        "ready",
        ds.map((d, i) => [addDay(d), 10 + i]),
        "Readiness",
        "readiness",
      ),
    );
    const [lagged] = computeCorrelationPairs(reg, [
      { x: "drive", y: "ready", lag: 1 },
    ]);
    expect(lagged).toBeDefined();
    expect(lagged.correlation).toBe(1);
    expect(lagged.lagDays).toBe(1);
    // Points are dated by the X (cause) day, not the shifted Y day.
    expect(lagged.points[0].date).toBe("2026-05-01");
    // Labels + insight call out the lag.
    expect(lagged.yLabel).toBe("Readiness (next-day)");
    expect(lagged.insight).toContain("next-day readiness");
  });

  it("the same metric pair can exist at lag 0 AND lag 1 with different joins", () => {
    const ds = dates(14);
    const reg = registryOf(
      makeSeries("x", ds.map((d, i) => [d, i])),
      makeSeries("y", ds.map((d, i) => [d, i % 5])),
    );
    const specs: PairSpec[] = [
      { x: "x", y: "y" },
      { x: "x", y: "y", lag: 1 },
    ];
    const pairs = computeCorrelationPairs(reg, specs);
    expect(pairs.length).toBe(2);
    expect(pairs[0].lagDays).toBe(0);
    expect(pairs[1].lagDays).toBe(1);
    // Lag-1 join has one fewer overlapping day (last x has no next-day y).
    expect(pairs[0].points.length).toBe(14);
    expect(pairs[1].points.length).toBe(13);
  });

  it("gates pairs below the minimum overlap", () => {
    const reg = registryOf(
      makeSeries("a", dates(9).map((d, i) => [d, i])),
      makeSeries("b", dates(9).map((d, i) => [d, i])),
    );
    expect(computeCorrelationPairs(reg, [{ x: "a", y: "b" }])).toEqual([]);
  });

  it("skips specs whose series are missing entirely", () => {
    const reg = registryOf(makeSeries("a", dates(20).map((d, i) => [d, i])));
    expect(
      computeCorrelationPairs(reg, [{ x: "a", y: "ghost" }, { x: "ghost", y: "a" }]),
    ).toEqual([]);
  });

  it("only joins dates present in BOTH series (sparse y)", () => {
    const ds = dates(20);
    const reg = registryOf(
      makeSeries("a", ds.map((d, i) => [d, i])),
      // y present only on even-index days → 10 overlaps.
      makeSeries("b", ds.filter((_, i) => i % 2 === 0).map((d, i) => [d, i])),
    );
    const [pair] = computeCorrelationPairs(reg, [{ x: "a", y: "b" }]);
    expect(pair.points.length).toBe(10);
  });

  it("flags a relationship that reverses direction across time as unstable", () => {
    const ds = dates(24);
    const reg = registryOf(
      makeSeries("a", ds.map((date, index) => [date, index])),
      makeSeries("b", ds.map((date, index) => [date, index < 12 ? index : 36 - index])),
    );
    const [pair] = computeCorrelationPairs(reg, [{ x: "a", y: "b" }]);
    expect(pair.stability).toBe("unstable");
  });
});

describe("computeCorrelationPairs wording overrides", () => {
  it("uses ySuffix/yNounForm for wake-dated overnight metrics", () => {
    const ds = dates(12);
    const reg = registryOf(
      makeSeries("drive", ds.map((d, i) => [d, i]), "Time in Car (min)", "time in car"),
      makeSeries("sleep", ds.map((d, i) => [addDay(d), i]), "Sleep (min)", "sleep duration"),
    );
    const [pair] = computeCorrelationPairs(reg, [
      { x: "drive", y: "sleep", lag: 1, ySuffix: "that night", yNounForm: "sleep that night" },
    ]);
    expect(pair.yLabel).toBe("Sleep (min) (that night)");
    expect(pair.insight).toContain("sleep that night");
    expect(pair.insight).not.toContain("next-day");
  });

  it("defaults read sanely for lag > 1", () => {
    const ds = dates(14);
    const reg = registryOf(
      makeSeries("a", ds.map((d, i) => [d, i]), "A", "alpha"),
      makeSeries("b", ds.map((d, i) => [d, i]), "B", "beta"),
    );
    const [pair] = computeCorrelationPairs(reg, [{ x: "a", y: "b", lag: 2 }]);
    expect(pair.yLabel).toBe("B (2 days later)");
    expect(pair.insight).toContain("beta 2 days later");
  });
});

describe("fillMissingDays", () => {
  it("fills interior gaps with the constant but never extends the span", () => {
    const s = makeSeries("d", [
      ["2026-05-01", 60],
      ["2026-05-04", 30],
      ["2026-05-06", 90],
    ]);
    const filled = fillMissingDays(s, 0);
    expect(filled.values.size).toBe(6); // 01..06 inclusive
    expect(filled.values.get("2026-05-02")).toBe(0);
    expect(filled.values.get("2026-05-03")).toBe(0);
    expect(filled.values.get("2026-05-05")).toBe(0);
    // Real observations untouched; nothing outside [min, max].
    expect(filled.values.get("2026-05-04")).toBe(30);
    expect(filled.values.has("2026-04-30")).toBe(false);
    expect(filled.values.has("2026-05-07")).toBe(false);
  });

  it("is a no-op for empty and single-day series", () => {
    expect(fillMissingDays(makeSeries("d", []), 0).values.size).toBe(0);
    expect(fillMissingDays(makeSeries("d", [["2026-05-01", 5]]), 0).values.size).toBe(1);
  });
});

describe("seriesFrom", () => {
  it("skips null/undefined values but keeps zeros", () => {
    const s = seriesFrom(
      "k", "K", "k",
      [
        { date: "2026-05-01", v: 0 },
        { date: "2026-05-02", v: null },
        { date: "2026-05-03", v: 7 },
      ] as { date: string; v: number | null }[],
      (r) => r.v,
    );
    expect(s.values.get("2026-05-01")).toBe(0); // falsy zero is a real value
    expect(s.values.has("2026-05-02")).toBe(false);
    expect(s.values.get("2026-05-03")).toBe(7);
  });
});

function addDay(d: string): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
