import type { IntakeByDay, SupplementAdherence } from "@health-dashboard/shared";
import type { IntakeRow } from "./ports.js";
import { addDays, formatDateInTz } from "../userTz.js";

/** Day-of-week labels in `Date#getUTCDay` order (0 = Sunday). */
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function countIntakesByDay(intakes: IntakeRow[], tz: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const intake of intakes) {
    const day = formatDateInTz(intake.takenAt, tz);
    out.set(day, (out.get(day) ?? 0) + 1);
  }
  return out;
}

/** Build a user-local daily dose series, falling back to counts for mixed units. */
export function doseSeriesByDay(
  intakes: IntakeRow[],
  tz: string,
): { days: Map<string, number>; xLabel: string } {
  const units = new Set(intakes.map((intake) => intake.unit));
  const uniform = units.size === 1;
  const days = new Map<string, number>();
  for (const intake of intakes) {
    const day = formatDateInTz(intake.takenAt, tz);
    days.set(day, (days.get(day) ?? 0) + (uniform ? intake.amount : 1));
  }
  for (const [day, dose] of days) {
    days.set(day, Math.round(dose * 1000) / 1000);
  }
  return {
    days,
    xLabel: uniform ? `Daily dose (${[...units][0]})` : "Doses taken (count)",
  };
}

/** Densify a dose series through the last complete day, using zero for skips. */
export function fillSkippedDays(
  days: Map<string, number>,
  endDay: string,
): Map<string, number> {
  if (days.size === 0) return new Map();
  const sorted = [...days.keys()].sort();
  if (sorted[0] > endDay) return new Map();
  const out = new Map<string, number>();
  for (let day = sorted[0]; day <= endDay; day = addDays(day, 1)) {
    out.set(day, days.get(day) ?? 0);
  }
  return out;
}

/** Move intake keys forward so day D is compared with a metric on D + lag. */
export function shiftIntakeDays(
  intakeDays: Map<string, number>,
  lagDays: number,
): Map<string, number> {
  if (lagDays === 0) return new Map(intakeDays);
  const out = new Map<string, number>();
  for (const [day, dose] of intakeDays) {
    out.set(addDays(day, lagDays), dose);
  }
  return out;
}

/** Aggregate intake rows into user-local daily totals for charting. */
export function rollupIntakeByDay(intakes: IntakeRow[], tz: string): IntakeByDay[] {
  const byKey = new Map<string, IntakeByDay>();
  for (const intake of intakes) {
    const date = formatDateInTz(intake.takenAt, tz);
    const key = `${date}|${intake.itemId}|${intake.unit}`;
    const current = byKey.get(key);
    if (current) {
      current.totalAmount += intake.amount;
      current.count += 1;
    } else {
      byKey.set(key, {
        date,
        itemId: intake.itemId,
        itemName: intake.itemName,
        totalAmount: intake.amount,
        unit: intake.unit,
        count: 1,
      });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.itemName.localeCompare(b.itemName),
  );
}

/** Build adherence, streak, weekday, and dense calendar summaries. */
export function buildAdherence(
  itemId: number,
  itemName: string,
  start: string,
  end: string,
  intakes: IntakeRow[],
  tz: string,
): SupplementAdherence {
  const counts = countIntakesByDay(intakes, tz);
  const days = enumerateDays(start, end);
  const daily = days.map((date) => ({ date, doses: counts.get(date) ?? 0 }));

  let bestStreak = 0;
  let run = 0;
  for (const day of daily) {
    if (day.doses > 0) {
      run += 1;
      bestStreak = Math.max(bestStreak, run);
    } else {
      run = 0;
    }
  }

  let currentStreak = 0;
  for (let i = daily.length - 1; i >= 0; i -= 1) {
    if (daily[i].doses === 0) break;
    currentStreak += 1;
  }

  const dowSum: number[] = [0, 0, 0, 0, 0, 0, 0];
  const dowCount: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const day of daily) {
    const dow = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    dowSum[dow] += day.doses;
    dowCount[dow] += 1;
  }

  return {
    itemId,
    itemName,
    start,
    end,
    totalDoses: intakes.length,
    daysWithIntake: daily.filter((day) => day.doses > 0).length,
    daysInWindow: daily.length,
    currentStreak,
    bestStreak,
    byDayOfWeek: dowSum.map((sum, dow) => ({
      dow,
      dayName: DAY_NAMES[dow],
      avgDoses: dowCount[dow] === 0 ? 0 : Math.round((sum / dowCount[dow]) * 100) / 100,
    })),
    daily,
  };
}

function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  for (let i = 0; i < 400 && cursor <= end; i += 1) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}
