import { describe, it, expect } from "vitest";
import {
  calibrate,
  excludeDraws,
  exceedance,
  MIN_PLACEBOS,
  placeboDraws,
  type PlaceboDraw,
} from "../services/experiments/calibration.js";
import { cohensD } from "../services/experiments/statistics.js";
import { MIN_READINGS_PER_SIDE } from "../services/experiments/confounds.js";
import { seededRandom } from "../services/evaluation/counterfactuals.js";
import { addDays } from "../services/userTz.js";

const START = "2025-01-01";

/** Gaussian-ish noise (sum of uniforms), deterministic per seed. */
function noise(seed: string): () => number {
  const random = seededRandom(seed);
  return () => random() + random() + random() + random() - 2;
}

function daily(days: number, valueOn: (i: number) => number) {
  return Array.from({ length: days }, (_, i) => ({ date: addDays(START, i), value: valueOn(i) }));
}

describe("placeboDraws", () => {
  it("measures |d| at every pivot with a full window on both sides", () => {
    const n = noise("draws");
    const points = daily(100, () => n());
    const draws = placeboDraws(points, 10, MIN_READINGS_PER_SIDE);

    // Pivots run from day 10 (before = days 0–9) to day 90 (after = 90–99).
    expect(draws).toHaveLength(81);
    expect(draws[0].pivot).toBe(addDays(START, 10));
    expect(draws.at(-1)!.pivot).toBe(addDays(START, 90));

    // Same arithmetic as the report itself.
    const at = draws.find((d) => d.pivot === addDays(START, 40))!;
    const before = points.slice(30, 40).map((p) => p.value);
    const after = points.slice(40, 50).map((p) => p.value);
    expect(at.absEffect).toBeCloseTo(Math.abs(cohensD(before, after)!), 9);
  });

  it("skips pivots where either side is too sparse to compare", () => {
    const n = noise("gap");
    // A 20-day hole in the middle of the history.
    const points = daily(120, () => n()).filter((_, i) => i < 50 || i >= 70);
    const draws = placeboDraws(points, 10, MIN_READINGS_PER_SIDE);
    const pivots = new Set(draws.map((d) => d.pivot));
    // Both windows of pivot 60 sit inside the hole.
    expect(pivots.has(addDays(START, 60))).toBe(false);
    // Pivot 30 is nowhere near it.
    expect(pivots.has(addDays(START, 30))).toBe(true);
  });

  it("skips a perfectly flat stretch instead of producing an infinite effect", () => {
    const points = daily(60, () => 5);
    expect(placeboDraws(points, 10, MIN_READINGS_PER_SIDE)).toEqual([]);
  });

  it("tolerates unsorted input", () => {
    const n = noise("order");
    const points = daily(60, () => n());
    expect(placeboDraws([...points].reverse(), 10, MIN_READINGS_PER_SIDE)).toEqual(placeboDraws(points, 10, MIN_READINGS_PER_SIDE));
  });
});

describe("excludeDraws", () => {
  const draws: PlaceboDraw[] = Array.from({ length: 60 }, (_, i) => ({
    pivot: addDays(START, i + 10),
    absEffect: 0.1,
  }));

  it("drops every placebo whose two windows straddle a logged change", () => {
    const boundary = addDays(START, 40);
    const kept = excludeDraws(draws, 10, [boundary]).map((d) => d.pivot);
    // The comparison around pivot p spans [p − 10, p + 9].
    expect(kept).not.toContain(addDays(START, 31));
    expect(kept).not.toContain(addDays(START, 50));
    // One side of the change only: ordinary variation, and kept — even
    // where it shares days with a report pivoting on that change.
    expect(kept).toContain(addDays(START, 30));
    expect(kept).toContain(addDays(START, 51));
  });
});

describe("exceedance", () => {
  it("is the smoothed share of placebos at least as large as observed", () => {
    expect(exceedance([0.1, 0.2, 0.3, 0.4], 0.35)).toBeCloseTo(2 / 5);
    expect(exceedance([0.1, 0.2, 0.3, 0.4], 0.3)).toBeCloseTo(3 / 5);
    // Never zero: the observed value is itself one draw.
    expect(exceedance([0.1, 0.2], 9)).toBeCloseTo(1 / 3);
  });
});

/** Placebo draws with iid |d| values, one per day. */
function iidDraws(seed: string, count: number): PlaceboDraw[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => ({ pivot: addDays(START, i), absEffect: random() }));
}

describe("calibrate", () => {
  it("ranks each metric against its own null", () => {
    const nulls = new Map([["a", iidDraws("a", 99)]]);
    const result = calibrate(new Map([["a", 5]]), nulls, 1);
    expect(result.get("a")).toEqual({
      windowDays: 1, effectSize: 5, placebos: 99, exceedance: 0.01, adjustedExceedance: 0.01,
    });
  });

  it("declines to calibrate a metric with too little clean history", () => {
    const nulls = new Map([["a", iidDraws("a", MIN_PLACEBOS - 1)]]);
    expect(calibrate(new Map([["a", 5]]), nulls, 1).has("a")).toBe(false);
  });

  it("charges the headline for looking at many metrics at once", () => {
    // One metric 7% unusual is unremarkable when nine others were also
    // checked: some metric that unusual turns up on most placebo dates.
    const metrics = Array.from({ length: 10 }, (_, i) => `m${i}`);
    const nulls = new Map(metrics.map((m) => [m, iidDraws(m, 400)]));
    const sortedM0 = nulls.get("m0")!.map((d) => d.absEffect).sort((a, b) => a - b);
    const observed = new Map(metrics.map((m) => [m, 0]));
    observed.set("m0", sortedM0[Math.floor(sortedM0.length * 0.93)]);

    const m0 = calibrate(observed, nulls, 1).get("m0")!;
    expect(m0.exceedance).toBeLessThan(0.1);
    expect(m0.adjustedExceedance).toBeGreaterThan(0.3);
  });

  it("holds the family-wise false-positive rate near nominal", () => {
    // Leave-one-out over the null itself: every placebo date judged
    // against the rest. Its share of headlines IS the false-positive rate.
    const metrics = Array.from({ length: 10 }, (_, i) => `m${i}`);
    const all = new Map(metrics.map((m) => [m, iidDraws(`fw:${m}`, 300)]));
    let headlines = 0;
    const trials = 300;
    for (let q = 0; q < trials; q++) {
      const pivot = addDays(START, q);
      const observed = new Map(metrics.map((m) => [m, all.get(m)![q].absEffect]));
      const rest = new Map(metrics.map((m) => [m, all.get(m)!.filter((d) => d.pivot !== pivot)]));
      const calibrated = [...calibrate(observed, rest, 1).values()];
      if (calibrated.some((c) => c.adjustedExceedance <= 0.1)) headlines += 1;
    }
    expect(headlines / trials).toBeGreaterThan(0.05);
    expect(headlines / trials).toBeLessThan(0.15);
  });

  it("holds the family-wise rate when neighbouring placebos are alike", () => {
    // Real 90-day placebos overlap almost entirely with their neighbours,
    // so |d| moves in long smooth runs. A report never sees its own
    // neighbours in its null; the dates it is ranked against must be
    // judged the same way, or the top of every run looks far rarer than
    // it is and the headline fires on half of all placebo dates.
    const windowDays = 60;
    const metrics = Array.from({ length: 6 }, (_, i) => `m${i}`);
    const smooth = (seed: string): PlaceboDraw[] => {
      const random = seededRandom(seed);
      const raw = Array.from({ length: 1000 + windowDays }, () => random());
      return Array.from({ length: 1000 }, (_, i) => ({
        pivot: addDays(START, i),
        absEffect: raw.slice(i, i + windowDays).reduce((a, b) => a + b, 0) / windowDays,
      }));
    };
    const all = new Map(metrics.map((m) => [m, smooth(`ac:${m}`)]));
    let headlines = 0;
    let trials = 0;
    for (let q = 0; q < 1000; q += 5) {
      const pivot = addDays(START, q);
      const observed = new Map(metrics.map((m) => [m, all.get(m)![q].absEffect]));
      // Exactly what the engine does for a report pivoting here.
      const rest = new Map(metrics.map((m) => [m, excludeDraws(all.get(m)!, windowDays, [pivot])]));
      const calibrated = [...calibrate(observed, rest, windowDays).values()];
      trials += 1;
      if (calibrated.some((c) => c.adjustedExceedance <= 0.1)) headlines += 1;
    }
    // 20.5% before ranking placebo dates leave-neighbours-out; ~12% after.
    expect(headlines / trials).toBeLessThan(0.16);
  });

  it("uses only placebo dates every metric was measured on when there are enough", () => {
    // `b` has no history before day 200. Mixing dates where only `a` was
    // measured would compare a one-metric minimum with a two-metric one.
    const a = iidDraws("a", 400);
    const b = iidDraws("b", 400).slice(200);
    const result = calibrate(new Map([["a", 5], ["b", 0]]), new Map([["a", a], ["b", b]]), 1);
    expect(result.get("a")!.placebos).toBe(400);
    expect(result.get("b")!.placebos).toBe(200);
    // Ranked among the 200 dates both were measured on, not all 400.
    expect(result.get("a")!.adjustedExceedance).toBeCloseTo(1 / 201, 4);
  });
});
