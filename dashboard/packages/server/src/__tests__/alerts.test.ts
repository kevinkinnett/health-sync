import { describe, it, expect } from "vitest";
import { detectAlerts } from "../services/alerts.js";
import { computeReadiness, type ReadinessDayInput } from "../services/readiness.js";

/**
 * The detector is deliberately conservative — these tests pin the
 * anti-noise contract: the illness triad needs 2-day persistence, only
 * absolute SpO2 floors fire, and a calm baseline produces NO alerts
 * (the single most important property — silence when nothing's wrong).
 */

function baseDays(
  n: number,
  over: Partial<Omit<ReadinessDayInput, "date">> = {},
): ReadinessDayInput[] {
  const base = {
    hrv: 50,
    rhr: 60,
    sleepMin: 420,
    breathing: 14,
    spo2: 96,
    skinTemp: 0,
    ...over,
  };
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    // tiny noise so baselines have non-zero std
    hrv: base.hrv != null ? base.hrv + (i % 2 ? 1 : -1) : null,
    rhr: base.rhr != null ? base.rhr + (i % 2 ? 1 : -1) : null,
    sleepMin: base.sleepMin,
    breathing: base.breathing != null ? base.breathing + (i % 2 ? 0.2 : -0.2) : null,
    spo2: base.spo2,
    skinTemp: base.skinTemp,
  }));
}

function withTail(
  days: ReadinessDayInput[],
  tail: Partial<Omit<ReadinessDayInput, "date">>[],
): ReadinessDayInput[] {
  const out = [...days];
  const start = days.length;
  tail.forEach((t, i) => {
    out.push({
      date: new Date(Date.UTC(2026, 0, 1 + start + i)).toISOString().slice(0, 10),
      hrv: 50,
      rhr: 60,
      sleepMin: 420,
      breathing: 14,
      spo2: 96,
      skinTemp: 0,
      ...t,
    });
  });
  return out;
}

function run(days: ReadinessDayInput[]) {
  return detectAlerts(days, computeReadiness(days));
}

describe("detectAlerts", () => {
  it("stays silent when everything is at baseline", () => {
    expect(run(baseDays(40))).toEqual([]);
  });

  it("fires the illness triad only after 2 persistent days", () => {
    const elevated = { rhr: 70, breathing: 18, skinTemp: 0.5 };
    // One bad day → no triad (could be a fluke / bad night).
    const oneDay = withTail(baseDays(40), [elevated]);
    expect(run(oneDay).find((a) => a.kind === "illness_triad")).toBeUndefined();

    // Two consecutive bad days → triad fires.
    const twoDays = withTail(baseDays(40), [elevated, elevated]);
    const triad = run(twoDays).find((a) => a.kind === "illness_triad");
    expect(triad).toBeDefined();
    expect(triad!.severity).toBe("alert");
    expect(triad!.detail).toMatch(/resting HR|breathing|skin temp/);
  });

  it("does not fire the triad when only one signal is elevated", () => {
    const oneSignal = { rhr: 72 }; // only RHR up, 2 days
    const days = withTail(baseDays(40), [oneSignal, oneSignal]);
    expect(run(days).find((a) => a.kind === "illness_triad")).toBeUndefined();
  });

  it("fires low_spo2 as an alert below the hard floor", () => {
    const days = withTail(baseDays(40), [{ spo2: 88 }]);
    const a = run(days).find((x) => x.kind === "low_spo2");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("alert");
  });

  it("fires low_spo2 as a softer warn in the borderline band", () => {
    const days = withTail(baseDays(40), [{ spo2: 91 }]);
    const a = run(days).find((x) => x.kind === "low_spo2");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("warn");
  });

  it("does not fire low_spo2 at a healthy 96%", () => {
    expect(
      run(baseDays(40)).find((a) => a.kind === "low_spo2"),
    ).toBeUndefined();
  });

  it("fires readiness_drop when the band is compromised", () => {
    // Tank HRV + raise RHR on the final day to force a low readiness.
    const days = withTail(baseDays(40), [{ hrv: 28, rhr: 74 }]);
    const r = computeReadiness(days);
    // Sanity: readiness really did drop.
    expect(r.band).toBe("compromised");
    const a = detectAlerts(days, r).find((x) => x.kind === "readiness_drop");
    expect(a).toBeDefined();
    expect(a!.severity).toBe("warn");
  });

  it("returns nothing when there is no data", () => {
    expect(run([])).toEqual([]);
  });

  it("tags each alert with the scored date", () => {
    const days = withTail(baseDays(40), [{ spo2: 88 }]);
    const a = run(days)[0];
    expect(a.date).toBe(days[days.length - 1].date);
  });
});
