import { describe, it, expect } from "vitest";
import {
  computeReadiness,
  type ReadinessDayInput,
} from "../services/readiness.js";

/**
 * The readiness math is the feature — these pin its contract against
 * synthetic series so the score stays interpretable: 50 = at baseline,
 * higher = better recovered, and the standard signals move it the
 * expected direction.
 */

// Build N flat baseline days then a final "today" with overrides.
function series(
  baselineDays: number,
  baseline: Partial<ReadinessDayInput>,
  today: Partial<ReadinessDayInput>,
): ReadinessDayInput[] {
  const days: ReadinessDayInput[] = [];
  const base: Omit<ReadinessDayInput, "date"> = {
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
  } as ReadinessDayInput);
  return days;
}

describe("computeReadiness", () => {
  it("scores ~50 (balanced) when today equals the baseline", () => {
    // Constant baseline → std 0 → every z is 0 → score 50. Add tiny
    // noise so std > 0 and the path is exercised realistically.
    const days = series(30, {}, {});
    // Perturb baseline slightly so std isn't exactly 0.
    days.forEach((d, i) => {
      if (i < 30) d.hrv = 50 + (i % 2 === 0 ? 1 : -1);
    });
    const r = computeReadiness(days);
    expect(r.score).not.toBeNull();
    expect(r.band).toBe("balanced");
    expect(r.score!).toBeGreaterThanOrEqual(45);
    expect(r.score!).toBeLessThanOrEqual(55);
    expect(r.date).toBe(days[days.length - 1].date);
  });

  it("scores high (primed) when HRV is up and resting HR is down", () => {
    // Baseline HRV ~50±3, RHR ~60±2; today HRV 65 (well above), RHR 52
    // (well below) → both core signals say 'recovered'.
    const days = series(30, {}, { hrv: 65, rhr: 52 });
    days.forEach((d, i) => {
      if (i < 30) {
        d.hrv = 50 + (i % 3) - 1;
        d.rhr = 60 + (i % 3) - 1;
      }
    });
    const r = computeReadiness(days);
    expect(r.score!).toBeGreaterThan(65);
    expect(r.band).toBe("primed");
    const hrv = r.components.find((c) => c.metric === "hrv")!;
    expect(hrv.z!).toBeGreaterThan(0); // signed positive = good
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
    const r = computeReadiness(days);
    expect(r.score!).toBeLessThan(40);
    expect(r.band).toBe("compromised");
    const rhr = r.components.find((c) => c.metric === "rhr")!;
    expect(rhr.z!).toBeLessThan(0); // elevated RHR → signed negative
    expect(rhr.status).toBe("poor");
  });

  it("penalizes a warm skin-temp deviation (illness signal)", () => {
    const cool = computeReadiness(series(30, {}, { skinTemp: 0 }));
    const warm = computeReadiness(series(30, {}, { skinTemp: 0.6 }));
    expect(warm.score!).toBeLessThan(cool.score!);
    const st = warm.components.find((c) => c.metric === "skinTemp")!;
    expect(st.z!).toBeLessThan(0);
  });

  it("returns 'insufficient' when there is no baseline history", () => {
    // Only 5 baseline days < MIN_BASELINE_DAYS (10).
    const days = series(5, {}, {});
    const r = computeReadiness(days);
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
    // No breathing / spo2 / skinTemp at all — HRV + RHR + sleep present.
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
    const r = computeReadiness(days);
    expect(r.score).not.toBeNull();
    expect(r.band).toBe("primed");
    // The absent metrics are reported as unavailable, not scored.
    expect(
      r.components.find((c) => c.metric === "breathing")!.status,
    ).toBe("unavailable");
  });

  it("falls back to the last complete day when today's overnight row is empty", () => {
    // Append a trailing all-null 'today' (overnight metrics not synced
    // yet). The scored date should be the prior complete day.
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
    const r = computeReadiness(days);
    expect(r.date).toBe(complete); // not the empty trailing day
    expect(r.score).not.toBeNull();
  });

  it("produces a trailing history series for the sparkline", () => {
    const days = series(40, {}, { hrv: 60 });
    days.forEach((d, i) => {
      d.hrv = 50 + (i % 5) - 2;
    });
    const r = computeReadiness(days);
    expect(r.history.length).toBeGreaterThan(1);
    expect(r.history.length).toBeLessThanOrEqual(14);
    // ascending by date
    const dates = r.history.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
