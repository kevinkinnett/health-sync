import { describe, it, expect } from "vitest";
import { HealthDataService } from "../services/healthDataService.js";

// Build a small set of fake repos where only `findLatest` has interesting data
// — that's the only call path `getRecords` exercises.
function makeService({
  activity = [] as any[],
  sleep = [] as any[],
  heartRate = [] as any[],
}: {
  activity?: any[];
  sleep?: any[];
  heartRate?: any[];
} = {}) {
  const fakeActivityRepo: any = {
    findLatest: async () => activity,
    findByDateRange: async () => activity,
  };
  const fakeSleepRepo: any = {
    findLatest: async () => sleep,
    findByDateRange: async () => sleep,
  };
  const fakeHeartRateRepo: any = {
    findLatest: async () => heartRate,
    findByDateRange: async () => heartRate,
  };
  const fakeWeightRepo: any = {
    findLatest: async () => [],
    findByDateRange: async () => [],
  };
  const fakeHrvRepo: any = {
    findLatest: async () => [],
    findByDateRange: async () => [],
  };
  const fakeExerciseLogRepo: any = {
    findLatest: async () => [],
    findByDateRange: async () => [],
  };
  return new HealthDataService(
    fakeActivityRepo,
    fakeSleepRepo,
    fakeHeartRateRepo,
    fakeWeightRepo,
    fakeHrvRepo,
    fakeExerciseLogRepo,
  );
}

describe("HealthDataService.getRecords", () => {
  it("does NOT return a 'Most Calories' record (deliberately omitted)", async () => {
    const days = [
      { date: "2026-04-01", steps: 8500, distanceKm: 6.0, caloriesOut: 2400, minutesVeryActive: 20, minutesFairlyActive: 5 },
      { date: "2026-04-02", steps: 9000, distanceKm: 6.3, caloriesOut: 2500, minutesVeryActive: 25, minutesFairlyActive: 0 },
    ];
    const svc = makeService({ activity: days });
    const out = await svc.getRecords();
    expect(out.records.find((r) => r.metric === "calories")).toBeUndefined();
    expect(out.records.find((r) => r.label === "Most Calories")).toBeUndefined();
  });

  it("rejects active-minute days that are physiologically impossible vs step count", async () => {
    // Mirrors the March 2026 Fitbit HR-zone glitch: tiny step counts but
    // hundreds of "very active" minutes — physically impossible. The real
    // workout day should win the record.
    const days = [
      // Anomaly cluster — Fitbit says 519 active min on a 1400-step day.
      { date: "2026-03-22", steps: 1400, distanceKm: 1.0, caloriesOut: 9800, minutesVeryActive: 519, minutesFairlyActive: 0 },
      { date: "2026-03-23", steps: 1800, distanceKm: 1.2, caloriesOut: 9100, minutesVeryActive: 480, minutesFairlyActive: 0 },
      // A real, plausible workout day: 70 active min on 9500 steps.
      { date: "2026-03-24", steps: 9500, distanceKm: 7.0, caloriesOut: 3100, minutesVeryActive: 65, minutesFairlyActive: 5 },
      // Background normal days.
      { date: "2026-03-25", steps: 4500, distanceKm: 3.0, caloriesOut: 2400, minutesVeryActive: 8, minutesFairlyActive: 0 },
    ];
    const svc = makeService({ activity: days });
    const out = await svc.getRecords();
    const activeRecord = out.records.find((r) => r.metric === "activeMin");
    expect(activeRecord).toBeDefined();
    expect(activeRecord!.value).toBe(70); // 65 + 5
    expect(activeRecord!.date).toBe("2026-03-24");
  });

  it("keeps a legitimate Most Steps record (real personal bests are tail values by definition)", async () => {
    const days = [
      { date: "2026-04-01", steps: 4500, distanceKm: 3.0, caloriesOut: 2400, minutesVeryActive: 8, minutesFairlyActive: 0 },
      { date: "2026-04-02", steps: 5200, distanceKm: 3.5, caloriesOut: 2500, minutesVeryActive: 12, minutesFairlyActive: 0 },
      // Personal best — 4x the typical day.
      { date: "2026-04-17", steps: 18984, distanceKm: 12.89, caloriesOut: 3500, minutesVeryActive: 60, minutesFairlyActive: 10 },
    ];
    const svc = makeService({ activity: days });
    const out = await svc.getRecords();
    const stepsRecord = out.records.find((r) => r.metric === "steps");
    expect(stepsRecord).toBeDefined();
    expect(stepsRecord!.value).toBe(18984);
    expect(stepsRecord!.date).toBe("2026-04-17");
  });

  it("rejects impossibly-low resting HR readings (sensor glitches under 35 bpm)", async () => {
    const days = [
      // Glitch: device fell off, briefly read 12.
      { date: "2026-02-01", restingHeartRate: 12 },
      // Real low — within plausible human range.
      { date: "2026-02-02", restingHeartRate: 58 },
      { date: "2026-02-03", restingHeartRate: 65 },
    ];
    const svc = makeService({ heartRate: days });
    const out = await svc.getRecords();
    const rhrRecord = out.records.find((r) => r.metric === "rhr");
    expect(rhrRecord).toBeDefined();
    expect(rhrRecord!.value).toBe(58);
    expect(rhrRecord!.date).toBe("2026-02-02");
  });

  it("still produces every other expected record kind", async () => {
    const days = [
      { date: "2026-04-01", steps: 9500, distanceKm: 6.5, caloriesOut: 2700, minutesVeryActive: 30, minutesFairlyActive: 5 },
    ];
    const sleep = [
      { date: "2026-04-01", totalMinutesAsleep: 480, efficiency: 92 },
    ];
    const heartRate = [
      { date: "2026-04-01", restingHeartRate: 60 },
    ];
    const svc = makeService({ activity: days, sleep, heartRate });
    const out = await svc.getRecords();
    const metrics = out.records.map((r) => r.metric).sort();
    expect(metrics).toEqual([
      "activeMin",
      "distance",
      "efficiency",
      "rhr",
      "sleep",
      "steps",
    ]);
  });
});

describe("HealthDataService.getRecords streak today-skip behavior", () => {
  // Why this suite exists: Fitbit reports today's running totals as
  // soon as the date rolls over, so a 5 AM dashboard load sees steps=0
  // for today even mid-streak. Without the today-skip, the current-
  // streak walker hits today's 0 and resets to 0 — wiping out a
  // legitimate 5-day streak. These tests pin that behavior down.

  function streakBy(out: Awaited<ReturnType<typeof makeService>["getRecords"]>, label: string) {
    return out.streaks.find((s) => s.label === label);
  }

  it("skips today's failing partial row so the prior streak still shows", async () => {
    const today = "2026-05-03";
    const days = [
      // 5 consecutive 5k+ days …
      { date: "2026-04-28", steps: 8503, minutesVeryActive: 25, minutesFairlyActive: 7 },
      { date: "2026-04-29", steps: 8204, minutesVeryActive: 30, minutesFairlyActive: 12 },
      { date: "2026-04-30", steps: 10348, minutesVeryActive: 80, minutesFairlyActive: 17 },
      { date: "2026-05-01", steps: 10513, minutesVeryActive: 100, minutesFairlyActive: 26 },
      { date: "2026-05-02", steps: 16136, minutesVeryActive: 120, minutesFairlyActive: 28 },
      // … and today's 0 (Fitbit's running total before any walking).
      { date: today, steps: 0, minutesVeryActive: 0, minutesFairlyActive: 0 },
    ];
    const svc = makeService({ activity: days });
    const out = await svc.getRecords(today);
    expect(streakBy(out, "5k+ Steps")?.current).toBe(5);
    expect(streakBy(out, "10+ Active Min")?.current).toBe(5);
  });

  it("counts today when it already passes the threshold", async () => {
    const today = "2026-05-03";
    const days = [
      { date: "2026-05-01", steps: 10513, minutesVeryActive: 100, minutesFairlyActive: 26 },
      { date: "2026-05-02", steps: 16136, minutesVeryActive: 120, minutesFairlyActive: 28 },
      { date: today, steps: 7200, minutesVeryActive: 30, minutesFairlyActive: 5 },
    ];
    const svc = makeService({ activity: days });
    const out = await svc.getRecords(today);
    expect(streakBy(out, "5k+ Steps")?.current).toBe(3);
    expect(streakBy(out, "10+ Active Min")?.current).toBe(3);
  });

  it("does NOT skip yesterday — a real failed day breaks the streak", async () => {
    // Yesterday at 2k steps is a real bad day, not partial data.
    const today = "2026-05-03";
    const days = [
      { date: "2026-04-30", steps: 10348, minutesVeryActive: 80, minutesFairlyActive: 17 },
      { date: "2026-05-01", steps: 10513, minutesVeryActive: 100, minutesFairlyActive: 26 },
      { date: "2026-05-02", steps: 2100, minutesVeryActive: 4, minutesFairlyActive: 1 }, // bad
      { date: today, steps: 0, minutesVeryActive: 0, minutesFairlyActive: 0 },
    ];
    const svc = makeService({ activity: days });
    const out = await svc.getRecords(today);
    // Today gets skipped (in-progress + failing); yesterday is the
    // newest "real" anchor and it failed → current streak is 0.
    expect(streakBy(out, "5k+ Steps")?.current).toBe(0);
  });

  it("does not skip when the latest row is older than today", async () => {
    // Sleep can lag a day if the morning sync hasn't fired yet. The
    // skip should only kick in when the latest row IS today.
    const today = "2026-05-03";
    const sleep = [
      { date: "2026-04-30", totalMinutesAsleep: 450, efficiency: 88 },
      { date: "2026-05-01", totalMinutesAsleep: 100, efficiency: 50 }, // bad day
    ];
    const svc = makeService({ sleep });
    const out = await svc.getRecords(today);
    // Latest sleep is 5/1 (not today), so no skip — failing 5/1 sets
    // current to 0.
    expect(streakBy(out, "7+ Hours Sleep")?.current).toBe(0);
  });

  it("preserves best streak when today fails (best is not rewritten)", async () => {
    const today = "2026-05-03";
    const days = [
      { date: "2026-04-26", steps: 9000, minutesVeryActive: 20, minutesFairlyActive: 5 },
      { date: "2026-04-27", steps: 9100, minutesVeryActive: 22, minutesFairlyActive: 6 },
      { date: "2026-04-28", steps: 9200, minutesVeryActive: 23, minutesFairlyActive: 7 },
      { date: "2026-04-29", steps: 9300, minutesVeryActive: 24, minutesFairlyActive: 8 },
      { date: "2026-04-30", steps: 9400, minutesVeryActive: 25, minutesFairlyActive: 9 },
      { date: "2026-05-01", steps: 9500, minutesVeryActive: 26, minutesFairlyActive: 10 },
      { date: "2026-05-02", steps: 9600, minutesVeryActive: 27, minutesFairlyActive: 11 },
      { date: today, steps: 0, minutesVeryActive: 0, minutesFairlyActive: 0 },
    ];
    const svc = makeService({ activity: days });
    const out = await svc.getRecords(today);
    expect(streakBy(out, "5k+ Steps")?.best).toBe(7);
    expect(streakBy(out, "5k+ Steps")?.current).toBe(7);
  });

  it("works with no `today` arg — preserves the legacy behavior", async () => {
    // Without `today` the walker treats the last row as authoritative.
    // Existing callers (e.g. older tests) should still pass — we only
    // fix the partial-day case when `today` is supplied.
    const days = [
      { date: "2026-04-01", steps: 8000, minutesVeryActive: 20, minutesFairlyActive: 5 },
      { date: "2026-04-02", steps: 0, minutesVeryActive: 0, minutesFairlyActive: 0 },
    ];
    const svc = makeService({ activity: days });
    const out = await svc.getRecords(); // no today
    expect(streakBy(out, "5k+ Steps")?.current).toBe(0);
    expect(streakBy(out, "5k+ Steps")?.best).toBe(1);
  });
});
