import type { Intervention } from "@health-dashboard/shared";
import { addDays } from "../userTz.js";

/**
 * Chooses the two windows a before/after comparison is measured over.
 *
 * Pure and clock-free — `today` is an argument — so window arithmetic is
 * pinnable without freezing time.
 *
 * The rule is deliberately simple and symmetric: the "after" window runs
 * from the change to wherever it ends (or today), and the "before" window
 * is the SAME LENGTH immediately preceding it. Equal lengths matter
 * because seasonal drift and gradual trends otherwise sneak in through
 * the back door — a 6-month "before" against a 3-week "after" compares
 * two different times of year as much as two different regimens.
 */

export interface WindowPair {
  before: { start: string; end: string; days: number };
  after: { start: string; end: string; days: number };
}

/** Longest span either side is allowed to take. */
const MAX_WINDOW_DAYS = 90;

/** How long an `event` intervention is presumed to keep acting. */
const EVENT_HORIZON_DAYS = 30;

export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function selectWindows(
  intervention: Intervention,
  today: string,
): WindowPair {
  const start = intervention.startedOn;

  // Where the "after" side stops: the intervention's own end, today, or
  // the event horizon — whichever comes first.
  const naturalEnd =
    intervention.kind === "event"
      ? addDays(start, EVENT_HORIZON_DAYS - 1)
      : (intervention.endedOn ?? today);
  const afterEnd = naturalEnd < today ? naturalEnd : today;

  // Inclusive day count, clamped. A change made today still yields a
  // 1-day window rather than a negative one.
  const rawAfterDays = daysBetween(start, afterEnd) + 1;
  const afterDays = Math.max(1, Math.min(rawAfterDays, MAX_WINDOW_DAYS));

  const beforeEnd = addDays(start, -1);
  const beforeStart = addDays(beforeEnd, -(afterDays - 1));

  return {
    before: { start: beforeStart, end: beforeEnd, days: afterDays },
    after: { start, end: addDays(start, afterDays - 1), days: afterDays },
  };
}
