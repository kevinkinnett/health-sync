import { describe, expect, it } from "vitest";
import { addDays } from "../services/userTz.js";
import {
  RecoveryAnomalyService,
  RECOVERY_ANOMALY_METHOD_VERSION,
} from "../services/health/recoveryAnomalies.js";
import type { ReadinessDayInput } from "../services/readiness.js";

function day(date: string, values: {
  hrv?: number;
  rhr?: number;
  sleep?: number;
  breathing?: number;
  spo2?: number;
  skinTemp?: number;
  restlessness?: number;
} = {}): ReadinessDayInput {
  return {
    date,
    provisional: false,
    hrv: { fitbit: values.hrv ?? 50 },
    rhr: { fitbit: values.rhr ?? 55 },
    sleepMin: { fitbit: values.sleep ?? 420 },
    breathing: { fitbit: values.breathing ?? 14 },
    spo2: { fitbit: values.spo2 ?? 97 },
    skinTemp: values.skinTemp ?? 0,
    restlessness: values.restlessness ?? 8,
  };
}

function baseline(count = 21): ReadinessDayInput[] {
  return Array.from({ length: count }, (_, index) => day(addDays("2026-01-01", index)));
}

describe("RecoveryAnomalyService", () => {
  it("surfaces a multi-signal adverse day with traceable robust deviations", async () => {
    const history = baseline();
    const targetDate = addDays("2026-01-01", history.length);
    history.push(day(targetDate, {
      hrv: 35,
      rhr: 65,
      sleep: 300,
      breathing: 16,
      spo2: 92,
      skinTemp: 0.7,
      restlessness: 18,
    }));
    const service = new RecoveryAnomalyService(async () => history);

    const report = await service.get(targetDate, targetDate, addDays(targetDate, 1));

    expect(report.methodVersion).toBe(RECOVERY_ANOMALY_METHOD_VERSION);
    expect(report.daysAnalyzed).toBe(1);
    expect(report.unusualDays).toHaveLength(1);
    expect(report.unusualDays[0]).toMatchObject({
      date: targetDate,
      severity: "strong",
      direction: "worse",
      coveragePct: 100,
    });
    expect(report.unusualDays[0].features.map((feature) => feature.metric)).toEqual(
      expect.arrayContaining(["hrv", "rhr", "sleep", "breathing", "spo2", "skinTemp", "restlessness"]),
    );
    expect(report.unusualDays[0].features.every((feature) => feature.sources[0].baselineDays >= 14)).toBe(true);
  });

  it("does not bridge an HRV measurement-regime cutover", async () => {
    const history: ReadinessDayInput[] = baseline().map((input) => ({
      ...input,
      hrv: { fitbit: {
        value: 50,
        measurement: "Legacy HRV",
        comparisonGroup: "overnight_hrv_rmssd",
        regime: "legacy-v1",
      } },
    }));
    const targetDate = addDays("2026-01-01", history.length);
    const target = day(targetDate, { rhr: 65, sleep: 300, breathing: 16, spo2: 92 });
    target.hrv = { fitbit: {
      value: 20,
      measurement: "New HRV",
      comparisonGroup: "overnight_hrv_rmssd",
      regime: "new-v2",
    } };
    history.push(target);
    const service = new RecoveryAnomalyService(async () => history);

    const report = await service.get(targetDate, targetDate, addDays(targetDate, 1));
    expect(report.unusualDays).toHaveLength(1);
    expect(report.unusualDays[0].features.some((feature) => feature.metric === "hrv")).toBe(false);
  });

  it("excludes the current local date and refuses to score thin baselines", async () => {
    const history = baseline(8);
    const targetDate = addDays("2026-01-01", history.length);
    history.push(day(targetDate, { hrv: 10, rhr: 80, sleep: 200 }));
    const service = new RecoveryAnomalyService(async () => history);

    const report = await service.get("2026-01-01", targetDate, targetDate);
    expect(report.daysAnalyzed).toBe(0);
    expect(report.unusualDays).toEqual([]);
  });
});
