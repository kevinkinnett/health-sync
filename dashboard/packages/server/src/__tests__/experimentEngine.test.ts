import { describe, it, expect } from "vitest";
import type { Intervention, MetricEffect } from "@health-dashboard/shared";
import { cohensD, mean, round, stdDev } from "../services/experiments/statistics.js";
import { selectWindows, daysBetween } from "../services/experiments/windows.js";
import { gradeConfidence, scanConfounds } from "../services/experiments/confounds.js";

function intervention(over: Partial<Intervention> = {}): Intervention {
  return {
    id: 1,
    kind: "period",
    category: "device",
    name: "Eight Sleep Pod",
    startedOn: "2026-05-02",
    endedOn: null,
    source: "manual",
    sourceRef: null,
    detail: null,
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    ...over,
  };
}

describe("statistics", () => {
  it("computes mean and sample standard deviation", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(round(stdDev([2, 4, 6]), 3)).toBe(2);
  });

  it("returns zero spread for degenerate inputs", () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([5])).toBe(0);
    expect(mean([])).toBe(0);
  });

  it("computes Cohen's d with the sign of the change", () => {
    const before = [10, 12, 11, 13, 9];
    const after = [20, 22, 21, 23, 19];
    const d = cohensD(before, after);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(3); // a huge, unambiguous shift
    expect(cohensD(after, before)!).toBeLessThan(0);
  });

  it("declines to report an effect size it cannot estimate", () => {
    expect(cohensD([1], [1, 2, 3])).toBeNull(); // no spread on one side
    expect(cohensD([5, 5, 5], [5, 5, 5])).toBeNull(); // zero pooled SD
  });

  it("never emits negative zero", () => {
    expect(Object.is(round(-0.0001, 2), -0)).toBe(false);
  });
});

describe("window selection", () => {
  it("gives before and after the SAME length so seasonality cannot leak in", () => {
    const w = selectWindows(intervention(), "2026-06-01");
    expect(w.after.days).toBe(w.before.days);
    expect(w.after.start).toBe("2026-05-02");
    expect(w.before.end).toBe("2026-05-01"); // ends the day before the pivot
  });

  it("stops the after window at the intervention's end date", () => {
    const w = selectWindows(
      intervention({ endedOn: "2026-05-11" }),
      "2026-07-26",
    );
    expect(w.after.end).toBe("2026-05-11");
    expect(w.after.days).toBe(10);
    expect(w.before.start).toBe("2026-04-22");
  });

  it("caps very long periods so the comparison stays local in time", () => {
    const w = selectWindows(
      intervention({ startedOn: "2020-01-01" }),
      "2026-07-26",
    );
    expect(w.after.days).toBe(90);
    expect(w.before.days).toBe(90);
  });

  it("gives an event a fixed horizon rather than running to today", () => {
    const w = selectWindows(
      intervention({ kind: "event", startedOn: "2026-05-02" }),
      "2026-07-26",
    );
    expect(w.after.days).toBe(30);
  });

  it("handles a change made today without producing a negative window", () => {
    const w = selectWindows(
      intervention({ startedOn: "2026-07-26" }),
      "2026-07-26",
    );
    expect(w.after.days).toBe(1);
    expect(w.before.days).toBe(1);
    expect(w.before.end).toBe("2026-07-25");
  });

  it("counts days inclusively", () => {
    expect(daysBetween("2026-05-01", "2026-05-11")).toBe(10);
  });
});

describe("confound scanning", () => {
  const windows = selectWindows(intervention(), "2026-06-30");
  const fullCoverage = { before: 1, after: 1 };

  it("flags a nearby intervention as HIGH — the real Lexapro case", () => {
    // The escitalopram dose was halved six days after the mattress
    // arrived. Any before/after that ignores this credits the wrong thing.
    const lexapro = intervention({
      id: 2,
      name: "Escitalopram 10 mg",
      category: "medication",
      startedOn: "2026-05-08",
    });
    const found = scanConfounds(intervention(), [lexapro], windows, fullCoverage);
    const hit = found.find((c) => c.kind === "nearby_intervention");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("high");
    expect(hit!.detail).toContain("Escitalopram");
    expect(hit!.detail).toContain("6 day");
  });

  it("does not flag an intervention outside the windows", () => {
    const old = intervention({ id: 3, name: "Old thing", startedOn: "2024-01-01" });
    const found = scanConfounds(intervention(), [old], windows, fullCoverage);
    expect(found.filter((c) => c.kind === "nearby_intervention")).toEqual([]);
  });

  it("never treats the subject as its own confound", () => {
    const subject = intervention();
    const found = scanConfounds(subject, [subject], windows, fullCoverage);
    expect(found.filter((c) => c.kind === "nearby_intervention")).toEqual([]);
  });

  it("flags a measurement change that straddles the pivot", () => {
    // The Google Health cutover changed how sleep efficiency is derived.
    const late = intervention({ startedOn: "2026-06-01" });
    const w = selectWindows(late, "2026-07-26");
    const found = scanConfounds(late, [], w, fullCoverage);
    const hit = found.find((c) => c.kind === "measurement_change");
    expect(hit).toBeDefined();
    expect(hit!.date).toBe("2026-06-12");
  });

  it("flags a too-short window and sparse coverage", () => {
    const fresh = intervention({ startedOn: "2026-07-24" });
    const w = selectWindows(fresh, "2026-07-26");
    const found = scanConfounds(fresh, [], w, { before: 0.2, after: 0.2 });
    expect(found.some((c) => c.kind === "short_window")).toBe(true);
    expect(found.filter((c) => c.kind === "sparse_data")).toHaveLength(2);
  });

  it("is clean when nothing is wrong", () => {
    const clean = intervention({ startedOn: "2026-02-01", endedOn: "2026-04-01" });
    const w = selectWindows(clean, "2026-07-26");
    expect(scanConfounds(clean, [], w, fullCoverage)).toEqual([]);
  });
});

describe("confidence grading", () => {
  const solid: MetricEffect[] = [
    {
      metric: "sleepMin",
      label: "Time asleep",
      unit: "min",
      betterDirection: "up",
      before: { n: 60, mean: 392, sd: 40 },
      after: { n: 60, mean: 435, sd: 35 },
      delta: 43,
      deltaPct: 11,
      direction: "up",
      effectSize: 1.1,
      improved: true,
      meaningful: true,
    },
  ];
  const longWindows = selectWindows(
    intervention({ startedOn: "2026-02-01", endedOn: "2026-05-01" }),
    "2026-07-26",
  );

  it("is strong only when windows are long and nothing is flagged", () => {
    expect(gradeConfidence(solid, [], longWindows)).toBe("strong");
  });

  it("a single HIGH confound caps confidence at weak, however clean the numbers", () => {
    const graded = gradeConfidence(
      solid,
      [{ kind: "nearby_intervention", severity: "high", detail: "x" }],
      longWindows,
    );
    expect(graded).toBe("weak");
  });

  it("drops to moderate for a low-severity flag", () => {
    expect(
      gradeConfidence(
        solid,
        [{ kind: "sparse_data", severity: "medium", detail: "x" }],
        longWindows,
      ),
    ).toBe("moderate");
  });

  it("is insufficient when no metric has enough observations", () => {
    const thin = [{ ...solid[0], before: { n: 2, mean: 1, sd: 0 } }];
    expect(gradeConfidence(thin, [], longWindows)).toBe("insufficient");
    expect(gradeConfidence([], [], longWindows)).toBe("insufficient");
  });
});
