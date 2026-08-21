import { describe, expect, it } from "vitest";
import type { RecoveryActivity, RecoverySession } from "@health-dashboard/shared";
import {
  alignRecoverySessions,
  estimateRecoveryEffects,
  type RecoverySleepPeriod,
} from "../services/analysis/recoveryEffectEngine.js";

const activity = (id: number, code: string): RecoveryActivity => ({
  id,
  code,
  name: code === "hot_blanket" ? "Hot blanket" : "Massage",
  category: code === "hot_blanket" ? "heat_therapy" : "massage",
  defaultDurationMinutes: null,
  notes: null,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const session = (
  id: number,
  activityId: number,
  startedAt: string,
  durationMinutes = 30,
): RecoverySession => ({
  id,
  activityId,
  activityCode: activityId === 1 ? "hot_blanket" : "massage",
  activityName: activityId === 1 ? "Hot blanket" : "Massage",
  activityCategory: activityId === 1 ? "heat_therapy" : "massage",
  startedAt,
  durationMinutes,
  intensity: null,
  temperatureF: null,
  massageType: null,
  notes: null,
  source: "manual",
  createdAt: startedAt,
  updatedAt: startedAt,
});

const period = (
  date: string,
  sleepStartAt: string,
  outcome = 80,
): RecoverySleepPeriod => ({
  date,
  sleepStartAt,
  weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
  priorSleepMinutes: 430,
  priorRestingHeartRate: 58,
  priorHrv: 42,
  recentTrainingLoad7: 24,
  outcomes: {
    sleepDuration: 420 + outcome,
    sleepEfficiency: outcome,
    restingHeartRate: 120 - outcome / 2,
    hrv: outcome / 2,
    restlessness: 100 - outcome,
    readiness: outcome,
  },
});

describe("alignRecoverySessions", () => {
  it("aligns evening and after-midnight sessions to the next chronological sleep", () => {
    const periods = [
      period("2026-08-20", "2026-08-20T03:00:00.000Z"),
      period("2026-08-21", "2026-08-21T06:00:00.000Z"),
    ];
    const aligned = alignRecoverySessions([
      session(1, 1, "2026-08-21T02:00:00.000Z", 45),
      session(2, 1, "2026-08-21T04:30:00.000Z", 30),
    ], periods);

    expect(aligned[0].sessions).toHaveLength(0);
    expect(aligned[1].sessions.map((item) => item.id)).toEqual([1, 2]);
  });

  it("does not align across missing sleep or beyond the 24-hour bound", () => {
    const aligned = alignRecoverySessions(
      [session(1, 1, "2026-08-18T01:00:00.000Z", 30)],
      [period("2026-08-20", "2026-08-20T06:00:00.000Z")],
    );
    expect(aligned[0].sessions).toHaveLength(0);
  });

  it("retains combined exposures so the effect engine can exclude them", () => {
    const aligned = alignRecoverySessions(
      [
        session(1, 1, "2026-08-21T01:00:00.000Z"),
        session(2, 2, "2026-08-21T02:00:00.000Z"),
      ],
      [period("2026-08-21", "2026-08-21T06:00:00.000Z")],
    );
    expect(new Set(aligned[0].sessions.map((item) => item.activityId))).toEqual(new Set([1, 2]));
  });
});

describe("estimateRecoveryEffects", () => {
  it("uses controls without replacement and requires ten outcome-specific pairs", () => {
    const periods: ReturnType<typeof alignRecoverySessions> = [];
    for (let index = 0; index < 11; index++) {
      const exposedDate = isoDate(Date.UTC(2026, 0, 5 + index * 7));
      const controlDate = isoDate(Date.UTC(2026, 0, 8 + index * 7));
      const exposed = period(exposedDate, `${exposedDate}T06:00:00.000Z`, 84);
      const control = period(controlDate, `${controlDate}T06:00:00.000Z`, 80);
      // Same weekday is a hard match requirement.
      control.weekday = exposed.weekday;
      if (index >= 9) exposed.outcomes.readiness = null;
      periods.push({ ...exposed, sessions: [session(index + 1, 1, `${exposedDate}T02:00:00.000Z`)] });
      periods.push({ ...control, sessions: [] });
    }
    // Combined exposure must not enter the single-activity estimate.
    const combinedDate = "2026-04-01";
    periods.push({
      ...period(combinedDate, `${combinedDate}T06:00:00.000Z`, 100),
      sessions: [
        session(100, 1, `${combinedDate}T01:00:00.000Z`),
        session(101, 2, `${combinedDate}T02:00:00.000Z`),
      ],
    });

    const result = estimateRecoveryEffects(
      [activity(1, "hot_blanket"), activity(2, "massage")],
      periods,
    );
    const sleep = result.effects.find((effect) => effect.outcome === "sleep_efficiency");

    expect(sleep).toMatchObject({
      activityCode: "hot_blanket",
      exposedPeriods: 11,
      matchedControlPeriods: 11,
      adjustedDifference: 4,
      evidence: "adjusted_association",
    });
    expect(result.effects.some((effect) => effect.outcome === "readiness")).toBe(false);
    expect(result.effects.some((effect) => effect.activityCode === "massage")).toBe(false);
    expect(result.matchedPairsByActivity.get(1)).toBe(11);
  });
});

function isoDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
