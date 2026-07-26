import { describe, it, expect } from "vitest";
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
