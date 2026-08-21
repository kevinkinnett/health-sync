import { describe, expect, it } from "vitest";
import type { DailyAnalysisRow } from "../services/analysis/dailyAnalysis.js";
import { estimateWorkoutEffects } from "../services/analysis/workoutEffectEngine.js";
import { addDays } from "../services/userTz.js";

function rows(weeks: number): DailyAnalysisRow[] {
  const start = "2026-01-05"; // Monday
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = addDays(start, index);
    const week = Math.floor(index / 7);
    const workout = index % 7 === 0 && week % 2 === 0;
    const monday = index % 7 === 0;
    return {
      date,
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      trainingLoad: workout ? 45 : 0,
      trainingMinutes: workout ? 50 : 0,
      exerciseTypes: workout ? ["strength"] : [],
      recentTrainingLoad7: week % 2 === 0 ? 0 : 45,
      priorSleepMinutes: 420,
      priorRestingHeartRate: 60,
      priorHrv: 50,
      outcomes: {
        // Non-Monday days are deliberately very different. Exact-weekday
        // matching must keep them out of the workout estimate.
        sleepDuration: workout ? 450 : monday ? 420 : 520,
        sleepEfficiency: workout ? 94 : monday ? 90 : 98,
        restingHeartRate: workout ? 58 : monday ? 60 : 55,
        hrv: workout ? 55 : monday ? 50 : 60,
        restlessness: workout ? 6 : monday ? 10 : 4,
      },
    };
  });
}

describe("estimateWorkoutEffects", () => {
  it("compares workout days with same-weekday rest days and reports real-unit effects", () => {
    const effects = estimateWorkoutEffects(rows(28));
    const sleep = effects.find((effect) => effect.exposure === "all" && effect.outcome === "sleep_duration");
    expect(sleep).toBeDefined();
    expect(sleep).toMatchObject({
      adjustedDifference: 30,
      workoutDays: 14,
      matchedRestDays: 14,
      conclusion: "helped",
      evidence: "adjusted_association",
    });
    expect(sleep!.confidenceInterval).toEqual({ low: 30, high: 30 });
  });

  it("keeps exercise type effects separate from the all-workout view", () => {
    const effects = estimateWorkoutEffects(rows(28));
    expect(effects.some((effect) => effect.exposure === "strength")).toBe(true);
    expect(effects.some((effect) => effect.exposure === "cardio")).toBe(false);
  });

  it("withholds estimates below the ten-match evidence floor", () => {
    expect(estimateWorkoutEffects(rows(16))).toEqual([]);
  });
});
