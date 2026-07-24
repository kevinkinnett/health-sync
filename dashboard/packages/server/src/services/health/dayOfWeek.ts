import type { ActivityDay, DayOfWeekAvg } from "@health-dashboard/shared";
import { avg } from "../stats.js";

/**
 * Day-of-week bucketing shared by the weekly-insights bars and the
 * heatmap. Both need the same rotation rule, and when it lived inline in
 * one 939-line service the two visualisations drifted into telling
 * different stories about the same week.
 */

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Rotate a length-7 array so index 0 becomes `startDow` and indices wrap
 * around mod 7. Used to align day-of-week visualisations with the rolling
 * window the rest of the dashboard uses (today on the right, oldest on
 * the left) instead of fixed Sun→Sat calendar order.
 */
export function rotateDow<T>(arr: readonly T[], startDow: number): T[] {
  const out: T[] = [];
  for (let offset = 0; offset < 7; offset++) {
    out.push(arr[(startDow + offset) % 7]);
  }
  return out;
}

/** UTC day-of-week (0=Sun..6=Sat) for a `YYYY-MM-DD` date string. */
export function dowOf(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

export function computeDayOfWeek(
  activity: ActivityDay[],
  startDow = 0,
): DayOfWeekAvg[] {
  const buckets: { steps: number[]; active: number[] }[] = Array.from(
    { length: 7 },
    () => ({ steps: [], active: [] }),
  );

  for (const d of activity) {
    if (d.steps == null) continue;
    const dow = dowOf(d.date);
    buckets[dow].steps.push(d.steps);
    buckets[dow].active.push(
      (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
    );
  }

  // Rotate the seven buckets so the result reads chronologically:
  // index 0 = `startDow`, index 6 = the day-of-week six days later.
  // The numeric `dow` field is preserved as the canonical 0..6 (Sun..Sat)
  // identifier — only the array ORDER changes.
  const result: DayOfWeekAvg[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const i = (startDow + offset) % 7;
    result.push({
      dow: i,
      dayName: DAY_NAMES[i],
      avgSteps: Math.round(avg(buckets[i].steps)),
      avgActiveMinutes: Math.round(avg(buckets[i].active)),
    });
  }
  return result;
}
