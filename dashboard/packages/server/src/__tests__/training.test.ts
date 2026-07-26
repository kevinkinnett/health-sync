import { describe, it, expect } from "vitest";
import { classifyExercise } from "../services/training/exerciseClassifier.js";
import {
  DEFAULT_MAX_HR,
  heartRateReserve,
  sessionLoad,
  sumByType,
} from "../services/training/trainingLoad.js";

/**
 * The classifier's job is to make three weeks of lifting visible, so the
 * cases below are drawn from the real exercise log: Fitbit auto-names
 * resistance work "Workout" or "Activity", and the only session ever
 * labelled "Strength training" was typed in by hand.
 */

const session = (
  activityName: string,
  steps: number | null = null,
  averageHeartRate: number | null = 120,
) => ({ activityName, steps, averageHeartRate });

describe("classifyExercise", () => {
  it("recognises an explicitly named strength session", () => {
    expect(classifyExercise(session("Strength training"))).toBe("strength");
    expect(classifyExercise(session("Weight lifting"))).toBe("strength");
  });

  it("infers strength from a generic name with effort but no steps", () => {
    // THE case this exists for: 7/24's "Workout", 50 min at 124 bpm,
    // steps null. Previously indistinguishable from nothing at all.
    expect(classifyExercise(session("Workout", null, 124))).toBe("strength");
    expect(classifyExercise(session("Activity", null, 113))).toBe("strength");
    expect(classifyExercise(session("Outdoor Workout", 0, 121))).toBe("strength");
  });

  it("does not call a generic session strength when it is clearly walking", () => {
    expect(classifyExercise(session("Workout", 2609, 105))).toBe("walk");
  });

  it("does not call an idle generic session strength", () => {
    // A generic entry with no steps AND no real heart rate is not
    // evidence of resistance work — it is evidence of nothing.
    expect(classifyExercise(session("Activity", null, 70))).toBe("other");
    expect(classifyExercise(session("Activity", null, null))).toBe("other");
  });

  it("tolerates a few paces between sets", () => {
    expect(classifyExercise(session("Workout", 120, 124))).toBe("strength");
  });

  it("classifies the named activities in the real log", () => {
    expect(classifyExercise(session("Walk", 2609, 105))).toBe("walk");
    expect(classifyExercise(session("Treadmill run", 1162, 114))).toBe("cardio");
    expect(classifyExercise(session("Outdoor Bike", null, 132))).toBe("cardio");
    expect(classifyExercise(session("Rowing machine", null, 132))).toBe("cardio");
    expect(classifyExercise(session("Sport", null, 120))).toBe("cardio");
    expect(classifyExercise(session("Mowing lawn", null, 132))).toBe("chore");
    expect(classifyExercise(session("Lawn mowing", null, 132))).toBe("chore");
  });

  it("is case-insensitive and falls back rather than guessing wildly", () => {
    expect(classifyExercise(session("WALK", 3000, 100))).toBe("walk");
    expect(classifyExercise(session("Kayaking", null, 120))).toBe("other");
  });
});

describe("heart-rate reserve", () => {
  it("is the fraction of the working range used", () => {
    expect(heartRateReserve(125, 65, 185)).toBeCloseTo(0.5, 5);
  });

  it("clamps outside the range instead of going negative or above 1", () => {
    expect(heartRateReserve(50, 65, 185)).toBe(0);
    expect(heartRateReserve(220, 65, 185)).toBe(1);
  });

  it("returns 0 for a degenerate range rather than dividing by zero", () => {
    expect(heartRateReserve(120, 185, 185)).toBe(0);
    expect(Number.isFinite(heartRateReserve(120, 200, 185))).toBe(true);
  });
});

describe("sessionLoad", () => {
  it("scores a harder session above an easier one of the same length", () => {
    const easy = sessionLoad({ minutes: 45, averageHeartRate: 95, restingHeartRate: 65 });
    const hard = sessionLoad({ minutes: 45, averageHeartRate: 130, restingHeartRate: 65 });
    expect(hard.load).toBeGreaterThan(easy.load);
  });

  it("scores a longer session above a shorter one of the same intensity", () => {
    const short = sessionLoad({ minutes: 20, averageHeartRate: 120, restingHeartRate: 65 });
    const long = sessionLoad({ minutes: 50, averageHeartRate: 120, restingHeartRate: 65 });
    expect(long.load).toBeGreaterThan(short.load);
  });

  it("gives real credit to a strength session that produced zero steps", () => {
    // The whole point: 50 minutes at 124 bpm is not nothing.
    const lifting = sessionLoad({ minutes: 50, averageHeartRate: 124, restingHeartRate: 65 });
    expect(lifting.load).toBeGreaterThan(20);
    expect(lifting.estimated).toBe(false);
  });

  it("flags a session with no heart rate instead of dropping or inflating it", () => {
    const result = sessionLoad({ minutes: 40, averageHeartRate: null, restingHeartRate: 65 });
    expect(result.estimated).toBe(true);
    expect(result.load).toBeGreaterThan(0);
    // A guess must not outscore a genuinely hard measured session.
    const measured = sessionLoad({ minutes: 40, averageHeartRate: 150, restingHeartRate: 65 });
    expect(result.load).toBeLessThan(measured.load);
  });

  it("is zero for a zero-length session", () => {
    expect(sessionLoad({ minutes: 0, averageHeartRate: 130, restingHeartRate: 65 }).load).toBe(0);
  });

  it("falls back to a default resting heart rate when the day has none", () => {
    const withRest = sessionLoad({ minutes: 30, averageHeartRate: 120, restingHeartRate: 65 });
    const without = sessionLoad({ minutes: 30, averageHeartRate: 120, restingHeartRate: null });
    expect(without.load).toBeCloseTo(withRest.load, 5);
  });

  it("a lower resting heart rate means the same session used more reserve", () => {
    const fitter = sessionLoad({ minutes: 30, averageHeartRate: 120, restingHeartRate: 50 });
    const lessFit = sessionLoad({ minutes: 30, averageHeartRate: 120, restingHeartRate: 80 });
    expect(fitter.load).toBeGreaterThan(lessFit.load);
  });

  it("scales with the assumed max HR but preserves the ORDER of days", () => {
    // The assumed maximum is the metric's weakest assumption, so what
    // matters is that changing it cannot reorder your own days.
    const a = { minutes: 40, averageHeartRate: 110, restingHeartRate: 65 };
    const b = { minutes: 40, averageHeartRate: 135, restingHeartRate: 65 };
    for (const maxHeartRate of [170, DEFAULT_MAX_HR, 200]) {
      expect(sessionLoad({ ...a, maxHeartRate }).load).toBeLessThan(
        sessionLoad({ ...b, maxHeartRate }).load,
      );
    }
  });
});

describe("sumByType", () => {
  it("totals load per type and omits empty ones", () => {
    expect(
      sumByType([
        { type: "strength", load: 30 },
        { type: "strength", load: 12.5 },
        { type: "walk", load: 8 },
        { type: "cardio", load: 0 },
      ]),
    ).toEqual({ strength: 42.5, walk: 8 });
  });

  it("is empty for no sessions", () => {
    expect(sumByType([])).toEqual({});
  });
});
