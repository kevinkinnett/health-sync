import { describe, it, expect } from "vitest";
import type { Intervention } from "@health-dashboard/shared";
import type { DailyPoint, DailySeriesSource, MetricSpec } from "../services/experiments/metricRegistry.js";
import type { AlignedRecoveryPeriod } from "../services/analysis/recoveryEffectEngine.js";
import {
  eventStudyNull,
  eventStudyPower,
  peakOffset,
  placeboAnchorCandidates,
  placeboDates,
  placeboExceedance,
  placeboIntervention,
  quantile,
  runPlacebos,
  runShifted,
  seededRandom,
  summarizePlacebos,
} from "../services/evaluation/counterfactuals.js";
import { addDays } from "../services/userTz.js";

const SPEC: MetricSpec = {
  key: "m", label: "Metric", unit: "u", betterDirection: "up", minMeaningfulDelta: 0.1,
};
const START = "2025-01-01";
const DAYS = 400;
const TODAY = addDays(START, DAYS);

/** Gaussian-ish noise (sum of uniforms), deterministic per seed. */
function noise(seed: string): () => number {
  const random = seededRandom(seed);
  return () => random() + random() + random() + random() - 2;
}

function series(valueOn: (date: string, i: number) => number): DailySeriesSource {
  const points: DailyPoint[] = Array.from({ length: DAYS }, (_, i) => {
    const date = addDays(START, i);
    return { date, value: valueOn(date, i) };
  });
  return {
    fetch: async (metric, start, end) =>
      metric === SPEC.key ? points.filter((p) => p.date >= start && p.date <= end) : [],
  };
}

const STEP_DATE = addDays(START, 200);
const stepped = (() => {
  const n = noise("step");
  return series((date) => (date >= STEP_DATE ? 3 : 0) + n());
})();
const flat = (() => {
  const n = noise("flat");
  return series(() => n());
})();

function real(over: Partial<Intervention>): Intervention {
  return { ...placeboIntervention(STEP_DATE, 30), id: 7, name: "Real change", kind: "period", endedOn: null, ...over };
}

describe("placebo changepoints", () => {
  it("spaces dates evenly and inclusively", () => {
    expect(placeboDates("2025-01-01", "2025-01-15", 7)).toEqual(["2025-01-01", "2025-01-08", "2025-01-15"]);
    expect(() => placeboDates("2025-01-01", "2025-01-02", 0)).toThrow();
  });

  it("gives every placebo the same fixed window", () => {
    const p = placeboIntervention("2025-03-01", 30, 4);
    expect(p.endedOn).toBe("2025-03-30");
    expect(p.id).toBeLessThan(0);
  });

  it("finds almost nothing on pure noise, and calls those placebos clean", async () => {
    const dates = placeboDates(addDays(START, 30), addDays(START, DAYS - 60), 10);
    const runs = await runPlacebos({ series: flat, realInterventions: [], dates, windowDays: 30, today: TODAY, specs: [SPEC] });
    expect(runs.length).toBeGreaterThan(20);
    expect(runs.every((r) => r.clean)).toBe(true);
    const summary = summarizePlacebos(runs, [SPEC]);
    const rate = summary.perMetric[0];
    expect(rate.judged).toBe(runs.length);
    // iid noise, 30 a side: |d| ≥ 0.3 by chance is uncommon but not rare.
    expect(rate.meaningfulRate).toBeLessThan(0.4);
    expect(quantile(rate.nullAbsEffect, 0.5)!).toBeLessThan(0.3);
  });

  it("marks a placebo next to a real intervention as not clean", async () => {
    const runs = await runPlacebos({
      series: stepped, realInterventions: [real({})], dates: [addDays(STEP_DATE, -10)], windowDays: 30, today: TODAY, specs: [SPEC],
    });
    expect(runs[0].clean).toBe(false);
    expect(runs[0].confoundKinds).toContain("nearby_intervention");
  });

  it("skips placebos whose after window has not finished", async () => {
    const runs = await runPlacebos({ series: flat, realInterventions: [], dates: [addDays(TODAY, -5)], windowDays: 30, today: TODAY, specs: [SPEC] });
    expect(runs).toEqual([]);
  });

  it("ranks a real step far out in the placebo null", async () => {
    const dates = placeboDates(addDays(START, 30), addDays(START, 150), 5);
    const nullRuns = await runPlacebos({ series: stepped, realInterventions: [], dates, windowDays: 30, today: TODAY, specs: [SPEC] });
    const nullSorted = summarizePlacebos(nullRuns, [SPEC]).perMetric[0].nullAbsEffect;
    const [atStep] = await runShifted({
      series: stepped, intervention: real({}), others: [], offsets: [0], windowDays: 30, today: TODAY, specs: [SPEC],
    });
    const d = atStep.metrics.m.effectSize!;
    expect(d).toBeGreaterThan(2);
    expect(placeboExceedance(nullSorted, Math.abs(d))).toBeLessThan(0.05);
  });
});

describe("shifted changepoints", () => {
  it("peaks at the true date of a step change", async () => {
    const offsets = Array.from({ length: 41 }, (_, i) => i - 20);
    const rows = await runShifted({
      series: stepped, intervention: real({}), others: [], offsets, windowDays: 30, today: TODAY, specs: [SPEC],
    });
    expect(rows).toHaveLength(41);
    expect(Math.abs(peakOffset(rows, "m")!)).toBeLessThanOrEqual(2);
  });

  it("does not peak at the date of a slow drift", async () => {
    const n = noise("drift");
    const drift = series((_, i) => i * 0.02 + n());
    const offsets = Array.from({ length: 41 }, (_, i) => i - 20);
    const rows = await runShifted({
      series: drift, intervention: real({}), others: [], offsets, windowDays: 30, today: TODAY, specs: [SPEC],
    });
    // A linear drift has the same before/after gap at every pivot: the
    // effect at ±20 days is about as large as at the "true" date, where a
    // step's effect falls away on both sides.
    const steppedRows = await runShifted({
      series: stepped, intervention: real({}), others: [], offsets, windowDays: 30, today: TODAY, specs: [SPEC],
    });
    const edgeRatio = (r: typeof rows) => {
      const at = (o: number) => Math.abs(r.find((x) => x.offset === o)!.metrics.m.effectSize!);
      return Math.max(at(-20), at(20)) / at(0);
    };
    expect(edgeRatio(steppedRows)).toBeLessThan(0.5);
    expect(edgeRatio(rows)).toBeGreaterThan(0.6);
  });

  it("keeps the intervention's id so it is never its own confound", async () => {
    const subject = real({});
    const [row] = await runShifted({
      series: stepped, intervention: subject, others: [subject], offsets: [-3], windowDays: 30, today: TODAY, specs: [SPEC],
    });
    expect(row.startedOn).toBe(addDays(STEP_DATE, -3));
    expect(row.confidence).toBe("strong");
  });

  it("returns null when nothing has an effect size", () => {
    expect(peakOffset([], "m")).toBeNull();
  });
});

describe("placebo statistics", () => {
  it("smooths exceedance so it is never zero", () => {
    expect(placeboExceedance([0.1, 0.2, 0.3], 5)).toBe(0.25);
    expect(placeboExceedance([0.1, 0.2, 0.3], 0)).toBe(1);
    expect(placeboExceedance([], 1)).toBeNull();
  });

  it("uses nearest-rank quantiles", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(quantile([1, 2, 3, 4], 0.95)).toBe(4);
    expect(quantile([], 0.5)).toBeNull();
  });

  it("is deterministic per seed", () => {
    const a = seededRandom("x");
    const b = seededRandom("x");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRandom("y")()).not.toBe(seededRandom("x")());
  });
});

describe("recovery event-study placebos", () => {
  const n = noise("periods");
  const periods: AlignedRecoveryPeriod[] = Array.from({ length: 300 }, (_, i) => {
    const date = addDays(START, i);
    return {
      date,
      sleepStartAt: `${date}T03:00:00.000Z`,
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      priorSleepMinutes: 420,
      priorRestingHeartRate: 60,
      priorHrv: 40,
      recentTrainingLoad7: 0,
      outcomes: {
        sleepDuration: 420 + 10 * n(),
        sleepEfficiency: 90 + 2 * n(),
        restingHeartRate: 60 + n(),
        hrv: 40 + 4 * n(),
        restlessness: null,
        readiness: null,
      },
      sessions: [],
    };
  });

  it("keeps placebo anchors away from real sessions", () => {
    const withSession = periods.map((p, i) => i === 100
      ? { ...p, sessions: [{ id: 1, activityId: 3, activityCode: "x", activityName: "X", activityCategory: "other" as const,
          startedAt: `${p.date}T00:00:00.000Z`, durationMinutes: 20, intensity: null, temperatureF: null, massageType: null,
          notes: null, source: "manual" as const, createdAt: "", updatedAt: "" }] }
      : p);
    const candidates = new Set(placeboAnchorCandidates(withSession));
    expect(candidates.has(periods[100].date)).toBe(false);
    expect(candidates.has(periods[104].date)).toBe(false);
    expect(candidates.has(periods[110].date)).toBe(true);
  });

  it("puts the null band near zero and narrows it as events accrue", () => {
    const at = (events: number) => eventStudyNull(periods, {
      outcome: "sleep_efficiency", eventsPerDraw: events, draws: 60, seed: `n${events}`,
    }).find((p) => p.offsetDays === 0)!;
    const few = at(3);
    const many = at(12);
    expect(few.draws).toBeGreaterThan(50);
    expect(many.absMedianDeltaP95!).toBeLessThan(few.absMedianDeltaP95!);
  });

  it("recovers a planted effect, with power that grows with events", () => {
    const power = (events: number) => eventStudyPower(periods, {
      outcome: "sleep_efficiency", eventsPerDraw: events, draws: 60, seed: `p${events}`,
      plant: { offsetDays: 0, delta: 4 }, threshold: 2,
    });
    const strong = power(12);
    expect(strong.recoveredMedian!).toBeGreaterThan(3);
    expect(strong.recoveredMedian!).toBeLessThan(5);
    expect(strong.power).toBeGreaterThan(power(3).power);
  });
});
