import type {
  ActivityDay,
  PersonalRecord,
  RecordsData,
  Streak,
} from "@health-dashboard/shared";
import type { ActivityRepository } from "../../repositories/activityRepo.js";
import type { SleepRepository } from "../../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../../repositories/heartRateRepo.js";

/**
 * Personal records and streaks. Split out of `healthDataService` — it
 * needs three repositories, not the thirteen the facade carries, and its
 * data-quality rules (see the plausibility filters below) are the most
 * opinionated logic in the read path, so they deserve their own home and
 * their own tests.
 */

/**
 * Sustained moderate-vigorous activity costs steps. ~100 steps/min is a
 * brisk walk and ~150-180 a run, but Fitbit also counts post-exercise HR
 * recovery as "active" — so the boundary needs slack. Empirically, on this
 * dataset's bad-data cluster (March 2026 HR-zone glitch) every garbage day
 * has steps/active-min ≤ 25, while every real workout day has ≥ 28. A
 * threshold of 30 cleanly separates them and survives normal interval and
 * long-hike days where the ratio dips into the 30s.
 */
const MIN_STEPS_PER_ACTIVE_MIN = 30;

/** Hard floor for resting HR — anything lower is sensor error. */
const MIN_PLAUSIBLE_RHR_BPM = 35;

export function isPhysicallyPlausibleActivity(d: ActivityDay): boolean {
  const activeMin = (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0);
  if (activeMin === 0) return true; // nothing to scrutinise
  // No step count means we can't sanity-check — let it through.
  if (d.steps == null) return true;
  return d.steps >= activeMin * MIN_STEPS_PER_ACTIVE_MIN;
}

export function pickMaxBy<T extends { date: string }>(
  rows: T[],
  getValue: (d: T) => number | null | undefined,
): { date: string; value: number } | null {
  let best: { date: string; value: number } | null = null;
  for (const row of rows) {
    const v = getValue(row);
    if (v == null) continue;
    if (best === null || v > best.value) best = { date: row.date, value: v };
  }
  return best;
}

export function pickMinBy<T extends { date: string }>(
  rows: T[],
  getValue: (d: T) => number | null | undefined,
): { date: string; value: number } | null {
  let best: { date: string; value: number } | null = null;
  for (const row of rows) {
    const v = getValue(row);
    if (v == null) continue;
    if (best === null || v < best.value) best = { date: row.date, value: v };
  }
  return best;
}

/**
 * Compute current and best streak of consecutive days satisfying `test`.
 *
 * `today` (YYYY-MM-DD in the user's calendar) lets the current-streak
 * walk skip an in-progress final day: Fitbit reports the running total
 * for "today" as soon as the date rolls over, so a 5 AM check would
 * see steps=0 and break a real streak. When the most recent row is
 * today AND fails the test, treat it as "data not yet in" rather than
 * a streak failure. A failing yesterday still breaks the streak — only
 * today gets the benefit of the doubt.
 *
 * `best` is unaffected: a passing today contributes to it, and a
 * failing today resets the running counter without rewriting history.
 */
export function computeStreak<T extends { date: string }>(
  sorted: T[],
  test: (d: T) => boolean,
  today?: string,
): { current: number; best: number } {
  let best = 0;
  let streak = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (test(sorted[i])) {
      streak++;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
  }

  // Current streak counts backwards from the end. If the very last
  // entry is today and fails the test, treat it as in-progress.
  let i = sorted.length - 1;
  if (today && i >= 0 && sorted[i].date === today && !test(sorted[i])) {
    i--;
  }
  let current = 0;
  for (; i >= 0; i--) {
    if (test(sorted[i])) current++;
    else break;
  }

  return { current, best };
}

export class RecordsService {
  constructor(
    private activityRepo: ActivityRepository,
    private sleepRepo: SleepRepository,
    private heartRateRepo: HeartRateRepository,
  ) {}

  async getRecords(today?: string): Promise<RecordsData> {
    const [activity, sleep, heartRate] = await Promise.all([
      this.activityRepo.findLatest(200),
      this.sleepRepo.findLatest(200),
      this.heartRateRepo.findLatest(200),
    ]);

    const records: PersonalRecord[] = [];

    // Steps & distance & sleep duration & efficiency: Fitbit's data here is
    // reliable, and a real personal best is by definition a tail value.
    // Don't filter — just pick the max.
    const bestSteps = pickMaxBy(activity, (d) => d.steps);
    if (bestSteps?.value != null) {
      records.push({ metric: "steps", label: "Most Steps", value: bestSteps.value, unit: "steps", date: bestSteps.date });
    }

    const bestDist = pickMaxBy(activity, (d) => d.distanceKm);
    if (bestDist?.value != null) {
      records.push({ metric: "distance", label: "Longest Distance", value: Math.round(bestDist.value * 100) / 100, unit: "km", date: bestDist.date });
    }

    // Active minutes: Fitbit's HR-zone classifier can fail in clusters
    // (e.g. the March 2026 anomaly inflated this 30-50x baseline). Real
    // workout days produce active minutes in proportion to step count
    // (~80-150 steps per active minute). Filter out days where the ratio
    // is physiologically impossible — guards against future glitches too.
    const cleanActivity = activity.filter(isPhysicallyPlausibleActivity);
    const bestActive = pickMaxBy(cleanActivity, (d) =>
      (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
    );
    if (bestActive && bestActive.value > 0) {
      records.push({ metric: "activeMin", label: "Most Active Minutes", value: bestActive.value, unit: "min", date: bestActive.date });
    }

    // "Most Calories" intentionally omitted: Fitbit's HR-driven caloriesOut
    // is the most polluted metric, and "biggest activity day" is already
    // captured by Most Active Minutes anyway.

    const bestSleep = pickMaxBy(sleep, (d) => d.totalMinutesAsleep);
    if (bestSleep?.value != null) {
      records.push({ metric: "sleep", label: "Longest Sleep", value: bestSleep.value, unit: "min", date: bestSleep.date });
    }

    const bestEff = pickMaxBy(sleep, (d) => d.efficiency);
    if (bestEff?.value != null) {
      records.push({ metric: "efficiency", label: "Best Sleep Efficiency", value: bestEff.value, unit: "%", date: bestEff.date });
    }

    // Lowest RHR — apply a hard floor at 35 bpm. Sub-35 readings are sensor
    // artefacts (device fell off, torn strap, etc.); even elite endurance
    // athletes typically don't sustain a true RHR below ~35.
    const cleanHr = heartRate.filter(
      (d) => d.restingHeartRate == null || d.restingHeartRate >= MIN_PLAUSIBLE_RHR_BPM,
    );
    const bestRhr = pickMinBy(cleanHr, (d) => d.restingHeartRate);
    if (bestRhr?.value != null) {
      records.push({ metric: "rhr", label: "Lowest Resting HR", value: bestRhr.value, unit: "bpm", date: bestRhr.date });
    }

    // Streaks
    const streaks: Streak[] = [];

    // Steps streak: consecutive days >= 5000 steps
    const sortedActivity = [...activity].sort((a, b) => a.date.localeCompare(b.date));
    const stepsStreak = computeStreak(
      sortedActivity,
      (d) => (d.steps ?? 0) >= 5000,
      today,
    );
    streaks.push({ label: "5k+ Steps", ...stepsStreak, unit: "days" });

    // Active streak: consecutive days with >= 10 active minutes
    const activeStreak = computeStreak(
      sortedActivity,
      (d) =>
        ((d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0)) >= 10,
      today,
    );
    streaks.push({ label: "10+ Active Min", ...activeStreak, unit: "days" });

    // Sleep streak: consecutive days >= 7 hours sleep. (Sleep is logged
    // against the wake-up date, so today's entry only appears after the
    // morning sync — the today-skip still applies if it lands at 0.)
    const sortedSleep = [...sleep].sort((a, b) => a.date.localeCompare(b.date));
    const sleepStreak = computeStreak(
      sortedSleep,
      (d) => (d.totalMinutesAsleep ?? 0) >= 420,
      today,
    );
    streaks.push({ label: "7+ Hours Sleep", ...sleepStreak, unit: "days" });

    return { records, streaks };
  }
}
