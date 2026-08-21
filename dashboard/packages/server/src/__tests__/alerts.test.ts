import { describe, it, expect } from "vitest";
import { detectAlerts } from "../services/alerts.js";
import { computeReadiness, type ReadinessDayInput } from "../services/readiness.js";

/**
 * The detector is deliberately conservative — these tests pin the
 * anti-noise contract: the illness triad needs 2-day persistence, only
 * absolute SpO2 floors fire, and a calm baseline produces NO alerts.
 *
 * Tests author in scalars (single-source); `toInputs` wraps them into the
 * source-aware shape (Fitbit-only), so behaviour matches the pre-fusion
 * detector. A dedicated test exercises the two-source fusion path.
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

function baseDays(
  n: number,
  over: Partial<Omit<ScalarDay, "date">> = {},
): ScalarDay[] {
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
    hrv: base.hrv != null ? base.hrv + (i % 2 ? 1 : -1) : null,
    rhr: base.rhr != null ? base.rhr + (i % 2 ? 1 : -1) : null,
    sleepMin: base.sleepMin,
    breathing: base.breathing != null ? base.breathing + (i % 2 ? 0.2 : -0.2) : null,
    spo2: base.spo2,
    skinTemp: base.skinTemp,
  }));
}

function withTail(
  days: ScalarDay[],
  tail: Partial<Omit<ScalarDay, "date">>[],
): ScalarDay[] {
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

function run(days: ScalarDay[]) {
  const inputs = toInputs(days);
  return detectAlerts(inputs, computeReadiness(inputs));
}

describe("detectAlerts", () => {
  it("stays silent when everything is at baseline", () => {
    expect(run(baseDays(40))).toEqual([]);
  });

  it("fires the illness triad only after 2 persistent days", () => {
    const elevated = { rhr: 70, breathing: 18, skinTemp: 0.5 };
    const oneDay = withTail(baseDays(40), [elevated]);
    expect(run(oneDay).find((a) => a.kind === "illness_triad")).toBeUndefined();

    const twoDays = withTail(baseDays(40), [elevated, elevated]);
    const triad = run(twoDays).find((a) => a.kind === "illness_triad");
    expect(triad).toBeDefined();
    expect(triad!.severity).toBe("alert");
    expect(triad!.detail).toMatch(/resting HR|breathing|skin temp/);
  });

  it("does not fire the triad when only one signal is elevated", () => {
    const oneSignal = { rhr: 72 };
    const days = withTail(baseDays(40), [oneSignal, oneSignal]);
    expect(run(days).find((a) => a.kind === "illness_triad")).toBeUndefined();
  });

  it("recognizes persistent multi-signal recovery strain beyond the classic triad", () => {
    const baseline = toInputs(baseDays(40)).map((day, index) => ({
      ...day,
      restlessness: 9 + (index % 2),
    }));
    const strained = (offset: number): ReadinessDayInput => ({
      date: new Date(Date.UTC(2026, 0, 41 + offset)).toISOString().slice(0, 10),
      hrv: { fitbit: 32 },
      rhr: { fitbit: 60 },
      sleepMin: { fitbit: 300 },
      breathing: { fitbit: 14 },
      spo2: { fitbit: 96 },
      skinTemp: 0,
      restlessness: 24,
    });
    const days = [...baseline, strained(0), strained(1)];
    const alert = detectAlerts(days, computeReadiness(days)).find(
      (candidate) => candidate.kind === "illness_triad",
    );
    expect(alert).toBeDefined();
    expect(alert!.detail).toMatch(/HRV|Sleep|Restlessness/);
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
    expect(run(baseDays(40)).find((a) => a.kind === "low_spo2")).toBeUndefined();
  });

  it("fires readiness_drop when the band is compromised", () => {
    const days = toInputs(withTail(baseDays(40), [{ hrv: 28, rhr: 74 }]));
    const r = computeReadiness(days);
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

  it("triad fires on Eight Sleep's elevated HR even when Fitbit is flat", () => {
    // 40 baseline nights with BOTH sources flat, then 2 nights where only
    // Eight Sleep's HR + breathing are elevated (Fitbit stays at baseline).
    // Source-relative trends are fused equally while outcome calibration is
    // rerun on repaired main sessions; the sustained mattress-side rise is
    // still large enough for the fused signal to cross the threshold.
    const baseline: ReadinessDayInput[] = [];
    for (let i = 0; i < 40; i++) {
      baseline.push({
        date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
        hrv: { fitbit: 50 + (i % 2 ? 1 : -1), eightSleep: 45 + (i % 2 ? 1 : -1) },
        rhr: { fitbit: 60 + (i % 2 ? 1 : -1), eightSleep: 62 + (i % 2 ? 1 : -1) },
        sleepMin: { fitbit: 420, eightSleep: 425 },
        breathing: { fitbit: 14 + (i % 2 ? 0.2 : -0.2), eightSleep: 13 + (i % 2 ? 0.2 : -0.2) },
        spo2: { fitbit: 96 },
        skinTemp: 0,
        restlessness: 10 + (i % 2 ? 1 : -1),
      });
    }
    const elevatedNight = (offset: number): ReadinessDayInput => ({
      // After all 40 baseline days (Jan 1 + 40 = Feb 10), so these are the
      // latest nights and become the scored "today" / "yesterday".
      date: new Date(Date.UTC(2026, 0, 1 + 40 + offset)).toISOString().slice(0, 10),
      hrv: { fitbit: 50, eightSleep: 45 },
      rhr: { fitbit: 60, eightSleep: 75 }, // Fitbit flat, Eight Sleep way up
      sleepMin: { fitbit: 420, eightSleep: 425 },
      breathing: { fitbit: 14, eightSleep: 17 }, // Eight Sleep elevated
      spo2: { fitbit: 96 },
      skinTemp: 0,
      restlessness: 10,
    });
    const days = [...baseline, elevatedNight(0), elevatedNight(1)];
    const triad = detectAlerts(days, computeReadiness(days)).find(
      (a) => a.kind === "illness_triad",
    );
    expect(triad).toBeDefined();
  });
});
