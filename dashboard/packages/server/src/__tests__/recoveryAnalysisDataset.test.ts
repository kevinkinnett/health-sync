import { describe, expect, it, vi } from "vitest";
import type { EightSleepDay, RecoverySession, SleepDay } from "@health-dashboard/shared";
import { RecoveryAnalysisDatasetBuilder } from "../services/recoveryAnalysisDataset.js";

const TODAY = "2026-08-21";

const currentSleep: SleepDay = {
  date: TODAY,
  totalMinutesAsleep: 514,
  totalMinutesInBed: 545,
  totalSleepRecords: 1,
  napMinutesAsleep: 0,
  minutesDeep: 92,
  minutesLight: 318,
  minutesRem: 104,
  minutesWake: 31,
  efficiency: 94,
  mainSleepStartTime: "2026-08-21T05:00:00.000Z",
  mainSleepEndTime: "2026-08-21T14:05:00.000Z",
  measurementMethod: "google_health_connect_v1",
  fetchedAt: "2026-08-21T14:10:00.000Z",
};

const precedingSession: RecoverySession = {
  id: 1,
  activityId: 2,
  activityCode: "massage",
  activityName: "Massage",
  activityCategory: "massage",
  startedAt: "2026-08-20T21:30:00.000Z",
  durationMinutes: 90,
  intensity: null,
  temperatureF: null,
  massageType: "deep tissue",
  notes: null,
  source: "manual",
  createdAt: "2026-08-20T21:30:00.000Z",
  updatedAt: "2026-08-20T21:30:00.000Z",
};

function buildDataset(options: {
  sessions?: RecoverySession[];
  sleep?: SleepDay[];
  eightSleep?: EightSleepDay[];
  heartRate?: Array<{ date: string; restingHeartRate: number | null }>;
  hrv?: Array<{ date: string; dailyRmssd: number | null; measurementMethod: string }>;
  readiness?: Array<{ date: string; score: number }>;
} = {}) {
  return new RecoveryAnalysisDatasetBuilder(
    {
      listActivities: vi.fn().mockResolvedValue([]),
      listSessions: vi.fn().mockResolvedValue(options.sessions ?? [precedingSession]),
    } as never,
    { findLatest: vi.fn().mockResolvedValue(options.sleep ?? [currentSleep]) } as never,
    { findLatest: vi.fn().mockResolvedValue(options.heartRate ?? []) } as never,
    { findLatest: vi.fn().mockResolvedValue(options.hrv ?? []) } as never,
    { findLatest: vi.fn().mockResolvedValue(options.eightSleep ?? []) } as never,
    { findLatest: vi.fn().mockResolvedValue([]) } as never,
    { getReadiness: vi.fn().mockResolvedValue({ history: options.readiness ?? [] }) } as never,
    "America/New_York",
  );
}

describe("RecoveryAnalysisDatasetBuilder current-day handling", () => {
  it("includes a completed current-day main sleep when a session aligns", async () => {
    const result = await buildDataset().build(TODAY);

    expect(result.window.end).toBe(TODAY);
    expect(result.currentDayIncluded).toBe(true);
    expect(result.periods).toHaveLength(1);
    expect(result.periods[0]).toMatchObject({ date: TODAY, sessions: [{ id: precedingSession.id }] });
  });

  it("rejects a current-day sleep row without a completed end boundary", async () => {
    const result = await buildDataset({
      sleep: [{ ...currentSleep, mainSleepEndTime: null }],
    }).build(TODAY);

    expect(result.window.end).toBe("2026-08-20");
    expect(result.periods).toEqual([]);
    expect(result.pendingSessionIds.has(precedingSession.id)).toBe(true);
  });

  it("keeps a completed sleep even when wake-day outcomes have not arrived", async () => {
    const result = await buildDataset().build(TODAY);

    expect(result.periods[0]?.outcomes).toMatchObject({
      sleepDuration: 514,
      restingHeartRate: null,
      hrv: null,
      readiness: null,
    });
  });

  it("does not retain an unexposed current sleep as a control", async () => {
    const result = await buildDataset({ sessions: [] }).build(TODAY);

    expect(result.currentDayIncluded).toBe(false);
    expect(result.window.end).toBe("2026-08-20");
    expect(result.periods).toEqual([]);
  });

  it("marks a recent session pending when no later completed sleep exists", async () => {
    const afterSleep = {
      ...precedingSession,
      id: 2,
      startedAt: "2026-08-21T21:00:00.000Z",
    };
    const result = await buildDataset({ sessions: [afterSleep] }).build(TODAY);

    expect(result.pendingSessionIds).toEqual(new Set([afterSleep.id]));
    expect(result.periods).toEqual([]);
  });

  it("does not call an older unaligned session pending", async () => {
    const expired = {
      ...precedingSession,
      id: 3,
      startedAt: "2026-08-19T21:00:00.000Z",
    };
    const result = await buildDataset({ sessions: [expired], sleep: [] }).build(TODAY);

    expect(result.pendingSessionIds.has(expired.id)).toBe(false);
  });

  it("uses Eastern local dates while aligning UTC instants across midnight", async () => {
    const lateEasternSession = {
      ...precedingSession,
      id: 4,
      startedAt: "2026-08-21T02:00:00.000Z",
      durationMinutes: 60,
    };
    const result = await buildDataset({ sessions: [lateEasternSession] }).build(TODAY);

    expect(result.periods[0]?.sessions.map((session) => session.id)).toEqual([lateEasternSession.id]);
    expect(result.pendingSessionIds.size).toBe(0);
  });

  it("preserves historical sleep behavior and the yesterday window", async () => {
    const historicalSleep = {
      ...currentSleep,
      date: "2026-08-20",
      mainSleepStartTime: "2026-08-20T05:00:00.000Z",
      mainSleepEndTime: null,
    };
    const historicalSession = {
      ...precedingSession,
      id: 5,
      startedAt: "2026-08-20T01:00:00.000Z",
      durationMinutes: 30,
    };
    const result = await buildDataset({
      sessions: [historicalSession],
      sleep: [historicalSleep],
    }).build(TODAY);

    expect(result.window.end).toBe("2026-08-20");
    expect(result.currentDayIncluded).toBe(false);
    expect(result.periods[0]).toMatchObject({ date: "2026-08-20", sessions: [{ id: historicalSession.id }] });
  });
});
