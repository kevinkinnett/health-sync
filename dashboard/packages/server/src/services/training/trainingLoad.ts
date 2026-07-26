import type { ExerciseType } from "@health-dashboard/shared";

/**
 * Turns a session into a training-load score.
 *
 * Uses Banister's TRIMP: duration weighted by heart-rate reserve, with an
 * exponential term so hard minutes count for more than easy ones. That
 * choice matters for the problem this solves — a 45-minute lifting
 * session at 120 bpm and a 45-minute stroll at 95 bpm are not the same
 * training stimulus, and a duration-only metric would call them equal.
 *
 *   hrr  = (avgHr − restingHr) / (maxHr − restingHr), clamped to [0, 1]
 *   load = minutes × hrr × 0.64 × e^(1.92 × hrr)
 *
 * HONEST LIMITS, and they are real:
 *
 *  - Maximum heart rate is ASSUMED, not measured (see DEFAULT_MAX_HR).
 *    It scales every score by roughly the same factor, so comparisons
 *    between your own days hold even if the constant is wrong. The
 *    absolute number is not meaningful on its own.
 *  - TRIMP was designed for continuous aerobic work. Resistance training
 *    is intermittent, so average heart rate understates its true stimulus.
 *    Lifting will score lower here than it "deserves" — but it will score
 *    something, which is the entire point versus a step count of zero.
 *  - A session with no heart rate falls back to a moderate intensity and
 *    is flagged `estimated`, rather than being silently dropped or
 *    silently counted as maximal.
 */

/**
 * Assumed maximum heart rate. Injectable so it can become a user setting
 * later; the default is a mid-range adult estimate.
 */
export const DEFAULT_MAX_HR = 185;

/** Assumed resting heart rate when the day's real value is unavailable. */
export const DEFAULT_RESTING_HR = 65;

/**
 * Heart-rate reserve assumed when a session carries no heart rate at all.
 * Deliberately modest — crediting an unmeasured session as hard would
 * make the metric flattering rather than useful.
 */
const FALLBACK_HRR = 0.35;

export interface LoadInputs {
  minutes: number;
  averageHeartRate: number | null;
  /** The day's resting heart rate, when known. */
  restingHeartRate: number | null;
  maxHeartRate?: number;
}

export interface LoadResult {
  load: number;
  estimated: boolean;
}

export function heartRateReserve(
  averageHeartRate: number,
  restingHeartRate: number,
  maxHeartRate: number,
): number {
  const span = maxHeartRate - restingHeartRate;
  if (span <= 0) return 0;
  const raw = (averageHeartRate - restingHeartRate) / span;
  return Math.min(1, Math.max(0, raw));
}

export function sessionLoad(inputs: LoadInputs): LoadResult {
  const minutes = Math.max(0, inputs.minutes);
  if (minutes === 0) return { load: 0, estimated: false };

  const maxHr = inputs.maxHeartRate ?? DEFAULT_MAX_HR;
  const restingHr = inputs.restingHeartRate ?? DEFAULT_RESTING_HR;

  let hrr: number;
  let estimated = false;
  if (inputs.averageHeartRate == null) {
    hrr = FALLBACK_HRR;
    estimated = true;
  } else {
    hrr = heartRateReserve(inputs.averageHeartRate, restingHr, maxHr);
  }

  // Banister TRIMP weighting (the widely-used male coefficients).
  const load = minutes * hrr * 0.64 * Math.exp(1.92 * hrr);
  return { load: Math.round(load * 10) / 10, estimated };
}

/** Sums per-type load, skipping zero entries so the map stays readable. */
export function sumByType(
  entries: { type: ExerciseType; load: number }[],
): Partial<Record<ExerciseType, number>> {
  const out: Partial<Record<ExerciseType, number>> = {};
  for (const { type, load } of entries) {
    if (load === 0) continue;
    out[type] = Math.round(((out[type] ?? 0) + load) * 10) / 10;
  }
  return out;
}
