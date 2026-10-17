import { describe, it, expect, vi } from "vitest";
import type { HealthDataService } from "../services/healthDataService.js";
import { HISTORY_DAYS } from "../services/experiments/calibration.js";
import { seededRandom } from "../services/evaluation/counterfactuals.js";
import { addDays } from "../services/userTz.js";
import { HealthSeriesSource } from "../services/experiments/healthSeriesSource.js";
import type { Intervention } from "@health-dashboard/shared";
import {
  ExperimentService,
  type InterventionLookup,
} from "../services/experiments/experimentService.js";
import type {
  DailyPoint,
  DailySeriesSource,
} from "../services/experiments/metricRegistry.js";

/**
 * End-to-end over the engine, driven from fixtures rather than a
 * database — the point of the `DailySeriesSource` port.
 *
 * The headline case is the real one: the Eight Sleep arrived 2 May and
 * sleep improved sharply, but the escitalopram dose was halved six days
 * later. The report must find the effect AND refuse to claim the mattress
 * caused it.
 */

const TODAY = "2026-07-26";

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

function lookup(rows: Intervention[]): InterventionLookup {
  return {
    findById: async (id) => rows.find((r) => r.id === id) ?? null,
    findAll: async () => rows,
  };
}

/**
 * Emits a flat-ish series with a deterministic wobble, so spread is
 * realistic without the test depending on randomness.
 */
function series(
  from: string,
  days: number,
  value: number,
  wobble = 4,
): DailyPoint[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    value: value + ((i % 5) - 2) * wobble,
  }));
}

/** A source where one metric steps up after the pivot. */
function steppedSource(
  metric: string,
  beforeValue: number,
  afterValue: number,
  pivot = "2026-05-02",
): DailySeriesSource {
  return {
    fetch: async (m, start, end) => {
      if (m !== metric) return [];
      const days =
        Math.round(
          (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
            86_400_000,
        ) + 1;
      return series(start, days, start >= pivot ? afterValue : beforeValue);
    },
  };
}

describe("ExperimentService", () => {
  it("finds the effect and reports it in the metric's own unit", async () => {
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("sleepMin", 392, 435),
    );
    const report = await svc.report(1, TODAY);

    const sleep = report.metrics.find((m) => m.metric === "sleepMin");
    expect(sleep).toBeDefined();
    expect(sleep!.before.mean).toBeCloseTo(392, 0);
    expect(sleep!.after.mean).toBeCloseTo(435, 0);
    expect(sleep!.delta).toBeCloseTo(43, 0);
    expect(sleep!.direction).toBe("up");
    expect(sleep!.improved).toBe(true);
    expect(sleep!.meaningful).toBe(true);
    expect(report.changepoint).toBe("2026-05-02");
  });

  it("knows which direction is an improvement per metric", async () => {
    // Resting HR falling is good; the same fall in sleep would not be.
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("restingHr", 67, 65),
    );
    const hr = (await svc.report(1, TODAY)).metrics.find(
      (m) => m.metric === "restingHr",
    );
    expect(hr!.direction).toBe("down");
    expect(hr!.improved).toBe(true);
  });

  it("refuses to credit the intervention when another one sits days away", async () => {
    const lexapro = intervention({
      id: 2,
      name: "Escitalopram 10 mg",
      category: "medication",
      startedOn: "2026-05-08",
    });
    const svc = new ExperimentService(
      lookup([intervention(), lexapro]),
      steppedSource("sleepMin", 392, 435),
    );
    const report = await svc.report(1, TODAY);

    // The effect is still reported...
    expect(report.metrics.find((m) => m.metric === "sleepMin")!.meaningful).toBe(true);
    // ...but the report will not call it strong evidence.
    expect(report.confidence).toBe("weak");
    expect(report.confounds.some((c) => c.detail.includes("Escitalopram"))).toBe(true);
    expect(report.summary).toContain("something else could explain it");
  });

  it("calls a trivial shift not meaningful even when it is consistent", async () => {
    // 0.4 bpm is inside the noise for resting HR no matter how tidy.
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("restingHr", 65, 65.4),
    );
    const hr = (await svc.report(1, TODAY)).metrics.find(
      (m) => m.metric === "restingHr",
    );
    expect(hr!.meaningful).toBe(false);
  });

  it("omits metrics with no data rather than rendering empty rows", async () => {
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("sleepMin", 392, 435),
    );
    const report = await svc.report(1, TODAY);
    expect(report.metrics.map((m) => m.metric)).toEqual(["sleepMin"]);
  });

  it("reports insufficient — not a false negative — when data is absent", async () => {
    const empty: DailySeriesSource = { fetch: async () => [] };
    const svc = new ExperimentService(lookup([intervention()]), empty);
    const report = await svc.report(1, TODAY);

    expect(report.metrics).toEqual([]);
    expect(report.confidence).toBe("insufficient");
    expect(report.summary).toContain("Not enough data");
  });

  it("says so plainly when nothing moved", async () => {
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("sleepMin", 420, 421),
    );
    const report = await svc.report(1, TODAY);
    expect(report.summary).toContain("Nothing moved meaningfully");
  });

  it("throws for an unknown intervention", async () => {
    const svc = new ExperimentService(lookup([]), steppedSource("sleepMin", 1, 2));
    await expect(svc.report(99, TODAY)).rejects.toThrow(/not found/i);
  });

  it("reports equal-length windows and how many days carried data", async () => {
    const svc = new ExperimentService(
      lookup([intervention({ startedOn: "2026-06-01", endedOn: "2026-06-30" })]),
      steppedSource("sleepMin", 392, 435, "2026-06-01"),
    );
    const report = await svc.report(1, TODAY);
    expect(report.after.days).toBe(30);
    expect(report.before.days).toBe(30);
    expect(report.after.observedDays).toBe(30);
  });
});

describe("ExperimentService — daily series for plotting", () => {
  it("returns the readings behind each comparable metric", async () => {
    // These points were already fetched to compute the means and then
    // thrown away. Keeping them is what lets the report show whether a
    // shift was a step at the changepoint or a drift that predates it.
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("sleepMin", 392, 435),
    );
    const report = await svc.report(1, TODAY);

    const sleep = report.series.find((s) => s.metric === "sleepMin");
    expect(sleep).toBeDefined();
    expect(sleep!.points.length).toBeGreaterThan(20);
    expect(sleep!.label).toBe("Time asleep");
    expect(sleep!.unit).toBe("min");
  });

  it("carries the window means rather than leaving them to the client", async () => {
    // The level lines drawn on the chart must not be able to disagree with
    // the numbers printed in the table beside them.
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("sleepMin", 392, 435),
    );
    const report = await svc.report(1, TODAY);

    const sleep = report.series.find((s) => s.metric === "sleepMin")!;
    const effect = report.metrics.find((m) => m.metric === "sleepMin")!;
    expect(sleep.beforeMean).toBe(effect.before.mean);
    expect(sleep.afterMean).toBe(effect.after.mean);
  });

  it("orders points by date across the window boundary", async () => {
    // Before and after are fetched separately and concatenated; a chart
    // drawing them out of order would render a line that doubles back.
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("sleepMin", 392, 435),
    );
    const report = await svc.report(1, TODAY);

    const dates = report.series.find((s) => s.metric === "sleepMin")!.points.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("omits a metric that has no series, matching the metrics list", async () => {
    // A metric with nothing on one side is dropped from `metrics`; it must
    // not appear as an empty panel either.
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("sleepMin", 392, 435),
    );
    const report = await svc.report(1, TODAY);

    expect(report.series.map((s) => s.metric).sort()).toEqual(
      report.metrics.map((m) => m.metric).sort(),
    );
  });

  it("keeps the series off the home-screen summaries", async () => {
    // summaries() runs full reports; shipping every point to the dashboard
    // card would make the payload grow with history for no benefit.
    const svc = new ExperimentService(
      lookup([intervention()]),
      steppedSource("sleepMin", 392, 435),
    );
    const [summary] = await svc.summaries(TODAY);
    expect(summary).toBeDefined();
    expect(JSON.stringify(summary)).not.toContain("points");
  });

  it("carries outcome source and measurement regimes into the report", async () => {
    const base = steppedSource("sleepMin", 392, 435);
    const sourced: DailySeriesSource = {
      fetch: async (...args) => (await base.fetch(...args)).map((point) => ({
        ...point,
        provenance: {
          deviceLabel: "Fitbit wearable",
          providerLabel: "Fitbit history / Google Health API",
          measurement: "Main overnight sleep duration",
          regimes: [point.date < "2026-06-12" ? "fitbit_legacy_main_v1" : "main_sleep_v2"],
        },
      })),
    };
    const report = await new ExperimentService(
      lookup([intervention()]),
      sourced,
    ).report(1, TODAY);

    expect(report.metrics[0]?.provenance?.deviceLabel).toBe("Fitbit wearable");
    expect(report.series[0]?.provenance?.regimes).toEqual([
      "fitbit_legacy_main_v1",
      "main_sleep_v2",
    ]);
  });
});

describe("ExperimentService — audit regressions", () => {
  it("does not treat the previous run of the same medication as a rival explanation", async () => {
    // The dose deriver writes 20 mg → 10 mg as two back-to-back runs. The
    // 20 mg run ending the day before is this change, seen from the other
    // side — not a second intervention that could explain the result.
    const twenty = intervention({
      id: 1,
      name: "Escitalopram 20 mg",
      category: "medication",
      source: "derived",
      startedOn: "2026-03-01",
      endedOn: "2026-05-07",
      sourceRef: "medication.item:7:dose:20:2026-03-01",
    });
    const ten = intervention({
      id: 2,
      name: "Escitalopram 10 mg",
      category: "medication",
      source: "derived",
      startedOn: "2026-05-08",
      endedOn: null,
      sourceRef: "medication.item:7:dose:10:2026-05-08",
    });
    const report = await new ExperimentService(
      lookup([twenty, ten]),
      steppedSource("sleepMin", 392, 435, "2026-05-08"),
      // Before the Google Health cutover, so the only candidate confound is
      // the sibling dose run itself.
    ).report(2, "2026-06-05");

    expect(report.confounds.filter((c) => c.severity === "high")).toEqual([]);
    expect(report.confounds.some((c) => c.detail.includes("ended"))).toBe(false);
    expect(report.confidence).not.toBe("weak");
    expect(report.summary).not.toContain("something else could explain it");
  });

  it("does not let a metric with fewer than five readings per side claim an improvement", async () => {
    const dense = steppedSource("sleepMin", 392, 435);
    const source: DailySeriesSource = {
      fetch: async (metric, start, end) => {
        if (metric === "deepMin") {
          // Three nights each side, with a big clean jump.
          return series(start, 3, start >= "2026-05-02" ? 90 : 60, 2);
        }
        return dense.fetch(metric, start, end);
      },
    };
    const report = await new ExperimentService(lookup([intervention()]), source).report(1, TODAY);

    const deep = report.metrics.find((m) => m.metric === "deepMin")!;
    expect(deep.before.n).toBe(3);
    expect(deep.meaningful).toBe(false);
    expect(report.summary).not.toContain("deep sleep");
    expect(report.metrics.find((m) => m.metric === "sleepMin")!.meaningful).toBe(true);
  });

  it("leaves today's half-accumulated activity out of an ongoing after window", async () => {
    const today = "2026-06-10";
    const source: DailySeriesSource = {
      fetch: async (metric, start, end) => {
        if (metric !== "steps") return [];
        return series(start, 40, 8000, 200)
          .filter((p) => p.date <= end)
          .map((p) => (p.date === today ? { ...p, value: 900 } : p));
      },
    };
    const report = await new ExperimentService(
      lookup([intervention({ startedOn: "2026-05-02" })]),
      source,
    ).report(1, today);

    const steps = report.metrics.find((m) => m.metric === "steps")!;
    const stepSeries = report.series.find((s) => s.metric === "steps")!;
    expect(stepSeries.points.some((p) => p.date === today)).toBe(false);
    expect(steps.after.n).toBe(stepSeries.points.filter((p) => p.date >= "2026-05-02").length);
  });

  it("reads each health family once per window instead of once per metric", async () => {
    const calls: string[] = [];
    const health = {
      // Some sleep on file, so the report has something to calibrate.
      getSleep: async (s: string, e: string) => {
        calls.push(`sleep ${s}`);
        return series(s, Math.round((Date.parse(e) - Date.parse(s)) / 86_400_000) + 1, 420)
          .map((p) => ({ date: p.date, totalMinutesAsleep: p.value }));
      },
      getHeartRate: async (s: string) => { calls.push(`hr ${s}`); return []; },
      getHrv: async (s: string) => { calls.push(`hrv ${s}`); return []; },
      getActivity: async (s: string) => { calls.push(`activity ${s}`); return []; },
    };
    const findById = vi.fn(async (id: number) => (id === 1 ? intervention() : null));
    const findAll = vi.fn(async () => [intervention()]);
    const svc = new ExperimentService(
      { findById, findAll },
      new HealthSeriesSource(health as unknown as HealthDataService),
    );

    await svc.report(1, TODAY);
    // Two windows, plus one read of the history the placebo null is built from.
    const history = addDays(TODAY, -HISTORY_DAYS);
    expect(calls.sort()).toEqual([
      "activity 2026-02-05", "activity 2026-05-02", `activity ${history}`,
      "hr 2026-02-05", "hr 2026-05-02", `hr ${history}`,
      "hrv 2026-02-05", "hrv 2026-05-02", `hrv ${history}`,
      "sleep 2026-02-05", "sleep 2026-05-02", `sleep ${history}`,
    ].sort());

    findById.mockClear();
    findAll.mockClear();
    calls.length = 0;
    await svc.summaries(TODAY);
    expect(findAll).toHaveBeenCalledTimes(1);
    expect(findById).not.toHaveBeenCalled();
    // The home screen runs several reports per load; the history read and
    // the nulls built from it are shared for the day, not repeated.
    expect(calls.filter((c) => c.endsWith(history))).toEqual([]);
  });
});

describe("ExperimentService — calibrated against the person's own history", () => {
  /** Gaussian-ish noise keyed on the date, so every fetch of a day agrees. */
  const noiseOn = (seed: string) => (date: string) => {
    const random = seededRandom(`${seed}:${date}`);
    return random() + random() + random() + random() - 2;
  };
  const dayIndex = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

  function sourceOf(metric: string, valueOn: (date: string) => number): DailySeriesSource {
    return {
      fetch: async (m, start, end) => {
        if (m !== metric) return [];
        const out: DailyPoint[] = [];
        for (let date = start; date <= end; date = addDays(date, 1)) out.push({ date, value: valueOn(date) });
        return out;
      },
    };
  }

  // Sleep that wanders by ±30 min over a four-month cycle, on top of
  // ordinary night-to-night noise: two adjacent months routinely differ by
  // far more than d = 0.3 with nothing having changed.
  const wobble = noiseOn("drift");
  const drifting = sourceOf("sleepMin", (date) =>
    420 + 30 * Math.sin((2 * Math.PI * dayIndex(date)) / 120) + 10 * wobble(date));

  const stepNoise = noiseOn("step");
  const stepped = sourceOf("sleepMin", (date) =>
    400 + 30 * stepNoise(date) + (date >= "2026-05-02" ? 40 : 0));

  const month = (startedOn: string) =>
    intervention({ startedOn, endedOn: addDays(startedOn, 29) });

  it("does not call ordinary drift an effect, though it clears the old d ≥ 0.3 bar", async () => {
    const dates = Array.from({ length: 24 }, (_, i) => addDays("2025-06-01", i * 11));
    const effects = [];
    for (const date of dates) {
      const report = await new ExperimentService(lookup([month(date)]), drifting).report(1, TODAY);
      effects.push(report.metrics.find((m) => m.metric === "sleepMin")!);
    }
    // The old rule would have flagged most of these placebo dates…
    const oldRule = effects.filter((e) => Math.abs(e.effectSize!) >= 0.3 && Math.abs(e.delta) >= 10);
    expect(oldRule.length).toBeGreaterThan(dates.length * 0.6);
    // …the calibrated one flags about as many as its threshold allows.
    expect(effects.filter((e) => e.meaningful).length).toBeLessThanOrEqual(dates.length * 0.2);
  });

  it("still finds a real step and exposes how unusual it was", async () => {
    const report = await new ExperimentService(lookup([month("2026-05-02")]), stepped).report(1, TODAY);
    const sleep = report.metrics.find((m) => m.metric === "sleepMin")!;

    expect(sleep.meaningful).toBe(true);
    expect(sleep.calibration).toBeDefined();
    expect(sleep.calibration!.placebos).toBeGreaterThan(100);
    expect(sleep.calibration!.exceedance).toBeLessThan(0.02);
    expect(sleep.calibration!.adjustedExceedance).toBeLessThan(0.1);
    expect(report.series.find((s) => s.metric === "sleepMin")!.meaningful).toBe(true);
    expect(report.confidence).toBe("strong");
  });

  it("puts nothing on the home screen and never grades a clean placebo strong", async () => {
    const svc = new ExperimentService(lookup([month("2025-09-10")]), drifting);
    const report = await svc.report(1, TODAY);
    const sleep = report.metrics.find((m) => m.metric === "sleepMin")!;
    expect(sleep.calibration!.exceedance).toBeGreaterThan(0.1);
    expect(sleep.meaningful).toBe(false);
    expect(report.confidence).not.toBe("strong");

    const [summary] = await svc.summaries(TODAY);
    expect(summary.headline).toBeNull();
  });

  it("judges a long report on the step at the changepoint", async () => {
    // Ninety-day windows overlap so much that a few years of history hold
    // only a handful of independent placebos — too few to call anything
    // rare. The step over the 30 days either side has many more.
    const report = await new ExperimentService(lookup([intervention()]), stepped).report(1, TODAY);
    const sleep = report.metrics.find((m) => m.metric === "sleepMin")!;
    expect(report.after.days).toBe(86);
    expect(sleep.calibration!.windowDays).toBe(30);
    expect(sleep.calibration!.effectSize).toBeGreaterThan(1);
    expect(sleep.meaningful).toBe(true);
  });

  it("does not credit a change with a shift that happened before it", async () => {
    // Low for two months, then up a month BEFORE the change, then back
    // down a little at it. The 90-day means say "up"; at the change the
    // series went down. That is drift that predates the pivot, not an effect.
    const n = noiseOn("predates");
    const source = sourceOf("sleepMin", (date) => {
      const level = date >= "2026-05-02" ? 420 : date >= "2026-04-02" ? 440 : 380;
      return level + 10 * n(date);
    });
    const report = await new ExperimentService(lookup([intervention()]), source).report(1, TODAY);
    const sleep = report.metrics.find((m) => m.metric === "sleepMin")!;
    expect(sleep.delta).toBeGreaterThan(10);
    expect(sleep.calibration!.effectSize).toBeLessThan(0);
    expect(sleep.meaningful).toBe(false);
  });

  it("will not call anything meaningful without enough history to calibrate", async () => {
    // Data only inside the two report windows: no placebo dates at all.
    const windowsOnly: DailySeriesSource = {
      fetch: async (m, start, end) => {
        if (m !== "sleepMin") return [];
        const lo = start < "2026-04-02" ? "2026-04-02" : start;
        const hi = end > "2026-05-31" ? "2026-05-31" : end;
        const out: DailyPoint[] = [];
        for (let date = lo; date <= hi; date = addDays(date, 1)) {
          out.push({ date, value: 400 + 30 * stepNoise(date) + (date >= "2026-05-02" ? 40 : 0) });
        }
        return out;
      },
    };
    const report = await new ExperimentService(lookup([month("2026-05-02")]), windowsOnly).report(1, TODAY);
    const sleep = report.metrics.find((m) => m.metric === "sleepMin")!;

    expect(Math.abs(sleep.effectSize!)).toBeGreaterThan(1);
    expect(sleep.calibration).toBeUndefined();
    expect(sleep.meaningful).toBe(false);
    expect(report.confidence).not.toBe("strong");
    expect(report.summary).toContain("history");
  });
});
