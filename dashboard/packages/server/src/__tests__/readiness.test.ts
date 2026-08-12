import { describe, it, expect } from "vitest";
import {
  computeReadiness,
  type ReadinessDayInput,
} from "../services/readiness.js";
import { fuseMetric } from "../services/signalFusion.js";

/**
 * The readiness math is the feature — these pin its contract against
 * synthetic series so the score stays interpretable: 50 = at baseline,
 * higher = better recovered, and the standard signals move it the
 * expected direction.
 *
 * Tests author in scalars (single-source) for readability; `toInputs`
 * wraps each into the source-aware shape as Fitbit-only. With one source
 * present, fusion reduces to that source's z vs its own baseline — so the
 * scores are identical to the pre-fusion engine.
 */

type ScalarDay = {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleepMin: number | null;
  breathing: number | null;
  spo2: number | null;
  skinTemp: number | null;
};

function toInputs(days: ScalarDay[]): ReadinessDayInput[] {
  return days.map((d) => ({
    date: d.date,
    hrv: { fitbit: d.hrv },
    rhr: { fitbit: d.rhr },
    sleepMin: { fitbit: d.sleepMin },
    breathing: { fitbit: d.breathing },
    spo2: { fitbit: d.spo2 },
    skinTemp: d.skinTemp,
    restlessness: null,
  }));
}

// Build N flat baseline days then a final "today" with overrides.
function series(
  baselineDays: number,
  baseline: Partial<ScalarDay>,
  today: Partial<ScalarDay>,
): ScalarDay[] {
  const days: ScalarDay[] = [];
  const base: Omit<ScalarDay, "date"> = {
    hrv: 50,
    rhr: 60,
    sleepMin: 420,
    breathing: 14,
    spo2: 96,
    skinTemp: 0,
    ...baseline,
  };
  for (let i = 0; i < baselineDays; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    days.push({ date: d.toISOString().slice(0, 10), ...base });
  }
  const last = new Date(Date.UTC(2026, 0, 1 + baselineDays));
  days.push({
    date: last.toISOString().slice(0, 10),
    ...base,
    ...today,
  } as ScalarDay);
  return days;
}

describe("computeReadiness", () => {
  it("scores ~50 (balanced) when today equals the baseline", () => {
    const days = series(30, {}, {});
    days.forEach((d, i) => {
      if (i < 30) d.hrv = 50 + (i % 2 === 0 ? 1 : -1);
    });
    const r = computeReadiness(toInputs(days));
    expect(r.score).not.toBeNull();
    expect(r.band).toBe("balanced");
    expect(r.score!).toBeGreaterThanOrEqual(45);
    expect(r.score!).toBeLessThanOrEqual(55);
    expect(r.date).toBe(days[days.length - 1].date);
  });

  it("scores high (primed) when HRV is up and resting HR is down", () => {
    const days = series(30, {}, { hrv: 65, rhr: 52 });
    days.forEach((d, i) => {
      if (i < 30) {
        d.hrv = 50 + (i % 3) - 1;
        d.rhr = 60 + (i % 3) - 1;
      }
    });
    const r = computeReadiness(toInputs(days));
    expect(r.score!).toBeGreaterThan(65);
    expect(r.band).toBe("primed");
    const hrv = r.components.find((c) => c.metric === "hrv")!;
    expect(hrv.z!).toBeGreaterThan(0);
    expect(hrv.status).toBe("good");
  });

  it("scores low (compromised) when HRV drops, RHR and breathing rise", () => {
    const days = series(30, {}, { hrv: 35, rhr: 70, breathing: 18 });
    days.forEach((d, i) => {
      if (i < 30) {
        d.hrv = 50 + (i % 3) - 1;
        d.rhr = 60 + (i % 3) - 1;
        d.breathing = 14 + ((i % 3) - 1) * 0.3;
      }
    });
    const r = computeReadiness(toInputs(days));
    expect(r.score!).toBeLessThan(40);
    expect(r.band).toBe("compromised");
    const rhr = r.components.find((c) => c.metric === "rhr")!;
    expect(rhr.z!).toBeLessThan(0);
    expect(rhr.status).toBe("poor");
  });

  it("penalizes a warm skin-temp deviation (illness signal)", () => {
    const cool = computeReadiness(toInputs(series(30, {}, { skinTemp: 0 })));
    const warm = computeReadiness(toInputs(series(30, {}, { skinTemp: 0.6 })));
    expect(warm.score!).toBeLessThan(cool.score!);
    const st = warm.components.find((c) => c.metric === "skinTemp")!;
    expect(st.z!).toBeLessThan(0);
  });

  it("returns 'insufficient' when there is no baseline history", () => {
    const days = series(5, {}, {});
    const r = computeReadiness(toInputs(days));
    expect(r.band).toBe("insufficient");
    expect(r.score).toBeNull();
    expect(r.summary).toMatch(/baseline/i);
  });

  it("returns 'insufficient' with no data at all", () => {
    const r = computeReadiness([]);
    expect(r.band).toBe("insufficient");
    expect(r.score).toBeNull();
    expect(r.date).toBeNull();
    expect(r.history).toEqual([]);
  });

  it("renormalizes when some metrics are missing (still scores on core signals)", () => {
    const days = series(
      30,
      { breathing: null, spo2: null, skinTemp: null },
      { hrv: 64, rhr: 53, breathing: null, spo2: null, skinTemp: null },
    );
    days.forEach((d, i) => {
      if (i < 30) {
        d.hrv = 50 + (i % 3) - 1;
        d.rhr = 60 + (i % 3) - 1;
      }
    });
    const r = computeReadiness(toInputs(days));
    expect(r.score).not.toBeNull();
    expect(r.band).toBe("primed");
    expect(r.components.find((c) => c.metric === "breathing")!.status).toBe(
      "unavailable",
    );
    expect(
      r.components.reduce((sum, component) => sum + component.weightPct, 0),
    ).toBeCloseTo(100, 1);
    expect(r.coveragePct).toBeLessThan(100);
    expect(r.caveats.join(" ")).toMatch(/coverage/i);
  });

  it("falls back to the last complete day when today's overnight row is empty", () => {
    const days = series(30, {}, { hrv: 64, rhr: 53 });
    days.forEach((d, i) => {
      if (i < 30) {
        d.hrv = 50 + (i % 3) - 1;
        d.rhr = 60 + (i % 3) - 1;
      }
    });
    const complete = days[days.length - 1].date;
    const emptyToday = new Date(Date.UTC(2026, 1, 1)).toISOString().slice(0, 10);
    days.push({
      date: emptyToday,
      hrv: null,
      rhr: null,
      sleepMin: null,
      breathing: null,
      spo2: null,
      skinTemp: null,
    });
    const r = computeReadiness(toInputs(days));
    expect(r.date).toBe(complete);
    expect(r.score).not.toBeNull();
  });

  it("produces a trailing history series for the sparkline", () => {
    const days = series(40, {}, { hrv: 60 });
    days.forEach((d, i) => {
      d.hrv = 50 + (i % 5) - 2;
    });
    const r = computeReadiness(toInputs(days));
    expect(r.history.length).toBeGreaterThan(1);
    expect(r.history.length).toBeLessThanOrEqual(14);
    const dates = r.history.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("fuses two sources for a signal (averaging their z-scores)", () => {
    // 30 flat baseline days with BOTH sources, then a today where Eight
    // Sleep HRV is well above its baseline but Fitbit HRV is flat.
    const days: ReadinessDayInput[] = [];
    for (let i = 0; i < 30; i++) {
      days.push({
        date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
        hrv: { fitbit: 50 + ((i % 3) - 1), eightSleep: 40 + ((i % 3) - 1) },
        rhr: { fitbit: 60 + ((i % 3) - 1), eightSleep: 62 + ((i % 3) - 1) },
        sleepMin: { fitbit: 420 },
        breathing: {},
        spo2: {},
        skinTemp: null,
        restlessness: null,
      });
    }
    days.push({
      date: new Date(Date.UTC(2026, 0, 31)).toISOString().slice(0, 10),
      hrv: { fitbit: 50, eightSleep: 55 }, // fitbit at baseline, 8slp up
      rhr: { fitbit: 60, eightSleep: 62 },
      sleepMin: { fitbit: 420 },
      breathing: {},
      spo2: {},
      skinTemp: null,
      restlessness: null,
    });
    const r = computeReadiness(days);
    const hrv = r.components.find((c) => c.metric === "hrv")!;
    // Both sensors contributed.
    expect(hrv.sources?.length).toBe(2);
    expect(hrv.sources?.map((s) => s.provenance.deviceLabel).sort()).toEqual([
      "Eight Sleep",
      "Fitbit device",
    ]);
    expect(
      hrv.sources?.find((s) => s.provenance.device === "fitbit")?.provenance.provider,
    ).toBe("google_health");
  });

  it("does not raw-average related heart-rate measurements with different definitions", () => {
    const fused = fuseMetric(
      "rhr",
      {
        fitbit: {
          value: 58,
          measurement: "Daily resting heart rate",
          comparisonGroup: "daily_resting_hr",
          regime: "daily_rhr_v1",
        },
        eightSleep: {
          value: 52,
          measurement: "Average sleeping heart rate",
          comparisonGroup: "average_sleeping_hr",
          regime: "eight_sleep_main_session_v1",
        },
      },
      {
        fitbit: [59, 60, 61, 60, 59, 60, 61, 60, 59, 60],
        eightSleep: [53, 54, 55, 54, 53, 54, 55, 54, 53, 54],
      },
      { minBaselineDays: 10, zClamp: 3 },
    );

    expect(fused.perSource).toHaveLength(2);
    expect(fused.measurementComparable).toBe(false);
    expect(fused.value).toBeNull();
    expect(fused.baseline).toBeNull();
    expect(fused.z).not.toBeNull();
  });

  it("does not bridge a baseline across a measurement-regime cutover", () => {
    const days: ReadinessDayInput[] = Array.from({ length: 15 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
      hrv: {
        fitbit: {
          value: 45 + (i % 3),
          measurement: "Overnight HRV (RMSSD)",
          comparisonGroup: "overnight_hrv_rmssd",
          regime: i < 10 ? "sample_mean_v1" : "daily_hrv_v1",
        },
      },
      rhr: { fitbit: 60 + (i % 3) },
      sleepMin: { fitbit: 420 + (i % 3) * 5 },
      breathing: { fitbit: 14 + (i % 3) * 0.1 },
      spo2: {},
      skinTemp: null,
      restlessness: null,
    }));

    const result = computeReadiness(days);
    expect(result.components.find((component) => component.metric === "hrv")?.status)
      .toBe("unavailable");
    expect(result.baselineDays).toBe(14);
  });

  it("reports version, confidence, coverage, and provisional daily state", () => {
    const days = toInputs(series(30, {}, {}));
    days[days.length - 1].provisional = true;
    const result = computeReadiness(days);

    expect(result.methodVersion).toBe("readiness-v2-main-night");
    expect(result.timezone).toBe("America/New_York");
    expect(result.provisional).toBe(true);
    expect(result.confidence).not.toBe("high");
    expect(result.coveragePct).toBeGreaterThan(0);
    expect(result.caveats.join(" ")).toMatch(/may revise/i);
  });
});
