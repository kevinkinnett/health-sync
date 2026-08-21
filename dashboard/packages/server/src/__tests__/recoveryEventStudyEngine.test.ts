import { describe, expect, it } from "vitest";
import type { RecoverySession } from "@health-dashboard/shared";
import { buildRecoveryEventStudy } from "../services/analysis/recoveryEventStudyEngine.js";
import type { AlignedRecoveryPeriod } from "../services/analysis/recoveryEffectEngine.js";

describe("buildRecoveryEventStudy", () => {
  it("groups same-activity sessions into one 15-day individual trajectory", () => {
    const periods = dailyPeriods("2026-01-01", 100);
    expose(periods, "2026-02-12", session(1, 1), session(2, 1));
    periods.find((period) => period.date === "2026-02-14")!.outcomes.hrv = null;

    const result = buildRecoveryEventStudy(periods, 1, "hrv", 1);

    expect(result).toMatchObject({ totalEvents: 1, eligibleEvents: 1, evidenceState: "individual" });
    expect(result.trajectories[0].sessionIds).toEqual([1, 2]);
    expect(result.trajectories[0].points).toHaveLength(15);
    expect(result.trajectories[0].points.find((point) => point.offsetDays === 2)?.actual).toBeNull();
    expect(result.trajectories[0].points[0]).toMatchObject({ controlCount: 8 });
  });

  it("returns actual values but no expected comparison when fewer than three controls exist", () => {
    const periods = dailyPeriods("2026-01-01", 18);
    expose(periods, "2026-01-15", session(1, 1));

    const result = buildRecoveryEventStudy(periods, 1, "sleep_duration", 0);
    const anchor = result.trajectories[0].points.find((point) => point.offsetDays === 0)!;

    expect(anchor.actual).not.toBeNull();
    expect(anchor.controlCount).toBeLessThan(3);
    expect(anchor.expectedCenter).toBeNull();
    expect(anchor.expectedRange).toBeNull();
    expect(anchor.delta).toBeNull();
  });

  it("marks combined anchors and later recovery exposure, excluding them from aggregates", () => {
    const periods = dailyPeriods("2026-01-01", 150);
    expose(periods, "2026-01-22", session(1, 1), session(2, 2));
    expose(periods, "2026-02-19", session(3, 1));
    expose(periods, "2026-03-19", session(4, 1));
    expose(periods, "2026-04-16", session(5, 1));
    expose(periods, "2026-02-21", session(6, 2));

    const result = buildRecoveryEventStudy(periods, 1, "readiness", 3);
    const combined = result.trajectories.find((trajectory) => trajectory.anchorDate === "2026-01-22")!;
    const contaminated = result.trajectories.find((trajectory) => trajectory.anchorDate === "2026-02-19")!
      .points.find((point) => point.offsetDays === 2)!;

    expect(combined).toMatchObject({ combinedExposure: true, eligible: false });
    expect(combined.points.find((point) => point.offsetDays === 0)?.excludedFromAggregate).toBe(true);
    expect(contaminated).toMatchObject({ recoveryExposures: ["Massage"], excludedFromAggregate: true });
    expect(result).toMatchObject({ eligibleEvents: 3, evidenceState: "provisional" });
    expect(result.aggregate.find((point) => point.offsetDays === 2)).toBeUndefined();
  });

  it.each([
    [0, 0, "collecting"],
    [1, 0, "individual"],
    [3, 9, "provisional"],
    [3, 10, "matched"],
    [3, 20, "moderate"],
    [3, 40, "high"],
  ] as const)("uses progressive state for %i events and %i matches", (eventCount, matches, expected) => {
    const periods = dailyPeriods("2025-01-01", 500);
    for (let index = 0; index < eventCount; index++) {
      expose(periods, addDays("2025-02-06", index * 35), session(index + 1, 1));
    }
    expect(buildRecoveryEventStudy(periods, 1, "sleep_efficiency", matches).evidenceState).toBe(expected);
  });

  it("aggregates all eligible events while limiting individual overlays to the 20 most recent", () => {
    const periods = dailyPeriods("2023-01-01", 1_200);
    for (let index = 0; index < 21; index++) {
      expose(periods, addDays("2023-02-02", index * 35), session(index + 1, 1));
    }

    const result = buildRecoveryEventStudy(periods, 1, "sleep_efficiency", 9);

    expect(result.totalTrajectories).toBe(21);
    expect(result.trajectories).toHaveLength(20);
    expect(result.aggregate.find((point) => point.offsetDays === 0)?.sampleCount).toBe(21);
    expect(result.trajectories[0].anchorDate > result.trajectories[19].anchorDate).toBe(true);
    expect(result.outcomeDefinition).toMatchObject({ unit: "%", betterDirection: "up" });
  });

  it("preserves short, long, and grouped duration plus the latest end-to-sleep gap", () => {
    const periods = dailyPeriods("2026-01-01", 120);
    expose(periods, "2026-01-22", session(1, 1, 25));
    expose(periods, "2026-02-19", session(2, 1, 60));
    expose(periods, "2026-03-19", session(3, 1, 20), session(4, 1, 25));
    const grouped = periods.find((period) => period.date === "2026-03-19")!;
    grouped.sessions[0].startedAt = "2026-03-19T01:00:00.000Z";
    grouped.sessions[1].startedAt = "2026-03-19T03:00:00.000Z";

    const result = buildRecoveryEventStudy(periods, 1, "hrv", 3);
    const short = result.trajectories.find((trajectory) => trajectory.anchorDate === "2026-01-22")!;
    const long = result.trajectories.find((trajectory) => trajectory.anchorDate === "2026-02-19")!;
    const combinedDuration = result.trajectories.find((trajectory) => trajectory.anchorDate === "2026-03-19")!;

    expect(short).toMatchObject({ totalDurationMinutes: 25, sessionToSleepMinutes: 215, durationGroup: "short" });
    expect(long).toMatchObject({ totalDurationMinutes: 60, sessionToSleepMinutes: 180, durationGroup: "long" });
    expect(combinedDuration).toMatchObject({ totalDurationMinutes: 45, sessionToSleepMinutes: 95, durationGroup: "long" });
  });

  it("withholds a duration trend when event count or variation is insufficient", () => {
    const sparse = dailyPeriods("2025-01-01", 300);
    expose(sparse, "2025-02-06", session(1, 1, 25));
    expose(sparse, "2025-03-13", session(2, 1, 60));
    const sparseResult = buildRecoveryEventStudy(sparse, 1, "readiness", 2);
    expect(sparseResult.durationResponses[0]).toMatchObject({
      state: "insufficient_events", eligibleEvents: 2, slopePer10Minutes: null,
    });
    expect(sparseResult.timingResponses[0]).toMatchObject({
      state: "insufficient_events", eligibleEvents: 2, slopePer60Minutes: null,
    });

    const repeated = dailyPeriods("2024-01-01", 700);
    for (let index = 0; index < 10; index++) {
      expose(repeated, addDays("2024-02-01", index * 35), session(index + 1, 1, 30));
    }
    const repeatedResult = buildRecoveryEventStudy(repeated, 1, "readiness", 10);
    expect(repeatedResult.durationResponses[0]).toMatchObject({
      state: "insufficient_variation", eligibleEvents: 10, distinctDurations: 1,
      durationRangeMinutes: 0, slopePer10Minutes: null,
    });
    expect(repeatedResult.timingResponses[0]).toMatchObject({
      state: "insufficient_variation", eligibleEvents: 10, distinctTimings: 1,
      timingRangeMinutes: 0, slopePer60Minutes: null,
    });
  });

  it("returns separate deterministic duration and timing associations and excludes contaminated follow-up points", () => {
    const periods = dailyPeriods("2024-01-01", 700);
    const durations = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65];
    const sleepGaps = [30, 90, 150, 210, 270, 330, 390, 450, 510, 570];
    durations.forEach((duration, index) => {
      const date = addDays("2024-02-01", index * 35);
      expose(periods, date, session(index + 1, 1, duration));
      setSessionGapToSleep(periods, date, sleepGaps[index]);
      periods.find((period) => period.date === date)!.outcomes.readiness = 70 + duration / 2;
    });
    expose(periods, addDays("2024-02-01", 1), session(100, 2, 45));

    const first = buildRecoveryEventStudy(periods, 1, "readiness", 10);
    const second = buildRecoveryEventStudy(periods, 1, "readiness", 10);
    const anchorTrend = first.durationResponses.find((response) => response.offsetDays === 0)!;
    const followUpTrend = first.durationResponses.find((response) => response.offsetDays === 1)!;
    const anchorTiming = first.timingResponses.find((response) => response.offsetDays === 0)!;
    const followUpTiming = first.timingResponses.find((response) => response.offsetDays === 1)!;

    expect(anchorTrend).toMatchObject({
      state: "available", eligibleEvents: 10, distinctDurations: 10, durationRangeMinutes: 45,
    });
    expect(anchorTrend.slopePer10Minutes).not.toBeNull();
    expect(anchorTrend.rankCorrelation).not.toBeNull();
    expect(anchorTrend.slopeConfidenceInterval).not.toBeNull();
    expect(second.durationResponses[0]).toEqual(anchorTrend);
    expect(followUpTrend).toMatchObject({ state: "insufficient_events", eligibleEvents: 9 });
    expect(anchorTiming).toMatchObject({
      state: "available", eligibleEvents: 10, distinctTimings: 10, timingRangeMinutes: 540,
    });
    expect(anchorTiming.slopePer60Minutes).not.toBeNull();
    expect(anchorTiming.rankCorrelation).not.toBeNull();
    expect(anchorTiming.slopeConfidenceInterval).not.toBeNull();
    expect(second.timingResponses[0]).toEqual(anchorTiming);
    expect(followUpTiming).toMatchObject({ state: "insufficient_events", eligibleEvents: 9 });
  });
});

function dailyPeriods(start: string, count: number): AlignedRecoveryPeriod[] {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(start, index);
    const value = 75 + (index % 8);
    return {
      date,
      sleepStartAt: `${date}T05:00:00.000Z`,
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      priorSleepMinutes: 420 + index % 30,
      priorRestingHeartRate: 55 + index % 5,
      priorHrv: 40 + index % 7,
      recentTrainingLoad7: 20 + index % 10,
      outcomes: {
        sleepDuration: 400 + value,
        sleepEfficiency: value,
        restingHeartRate: 100 - value / 2,
        hrv: value / 2,
        restlessness: 100 - value,
        readiness: value,
      },
      sessions: [],
    };
  });
}

function expose(periods: AlignedRecoveryPeriod[], date: string, ...sessions: RecoverySession[]): void {
  const period = periods.find((candidate) => candidate.date === date);
  if (!period) throw new Error(`Missing fixture period ${date}`);
  period.sessions = sessions.map((item) => ({ ...item, startedAt: `${date}T01:00:00.000Z` }));
}

function setSessionGapToSleep(periods: AlignedRecoveryPeriod[], date: string, gapMinutes: number): void {
  const period = periods.find((candidate) => candidate.date === date);
  if (!period) throw new Error(`Missing fixture period ${date}`);
  const sleepStart = Date.parse(period.sleepStartAt);
  period.sessions = period.sessions.map((item) => ({
    ...item,
    startedAt: new Date(sleepStart - (gapMinutes + item.durationMinutes) * 60_000).toISOString(),
  }));
}

function session(id: number, activityId: number, durationMinutes = 30): RecoverySession {
  return {
    id,
    activityId,
    activityCode: activityId === 1 ? "hot_blanket" : "massage",
    activityName: activityId === 1 ? "Hot blanket" : "Massage",
    activityCategory: activityId === 1 ? "heat_therapy" : "massage",
    startedAt: "2026-01-01T01:00:00.000Z",
    durationMinutes,
    intensity: null,
    temperatureF: null,
    massageType: null,
    notes: null,
    source: "manual",
    createdAt: "2026-01-01T01:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
  };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
