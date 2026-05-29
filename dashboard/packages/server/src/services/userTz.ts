/**
 * Server-only timezone helpers for converting between UTC instants
 * (TIMESTAMPTZ in Postgres) and user-local calendar days. **Never** use
 * fixed offsets like `-04:00` here — every helper takes an IANA name
 * (e.g. `America/New_York`) so DST transitions resolve correctly.
 *
 * Pure date-string utilities (`addDays`, `formatDateInTz`, `todayInTz`)
 * live in `@health-dashboard/shared` and are re-exported below; the
 * functions that touch real-Date instants and produce TIMESTAMPTZ
 * bounds (`tzDayStartUtc`, `tzDayEndUtc`) stay here because the
 * client never needs them.
 */

export { addDays, formatDateInTz, todayInTz } from "@health-dashboard/shared";
import { addDays } from "@health-dashboard/shared";

/**
 * Returns the UTC instant string (`YYYY-MM-DDTHH:MM:SS.sssZ`) that
 * corresponds to local midnight at the *start* of `date` in `tz`. This is
 * the lower bound to use when filtering TIMESTAMPTZ data for a user's
 * calendar day.
 *
 * @example
 *   tzDayStartUtc("2026-04-26", "America/New_York")
 *     // → "2026-04-26T04:00:00.000Z"  (EDT, UTC-4)
 *   tzDayStartUtc("2026-01-15", "America/New_York")
 *     // → "2026-01-15T05:00:00.000Z"  (EST, UTC-5)
 */
export function tzDayStartUtc(date: string, tz: string): string {
  return localMidnightToUtc(date, tz).toISOString();
}

/**
 * Returns the UTC instant string at the *end* of `date` in `tz` — the
 * inclusive last millisecond. Use as the upper bound for a single-day or
 * date-range filter on TIMESTAMPTZ data.
 */
export function tzDayEndUtc(date: string, tz: string): string {
  const startNextDay = localMidnightToUtc(addDays(date, 1), tz);
  return new Date(startNextDay.getTime() - 1).toISOString();
}

/**
 * Resolves "midnight on `date` in `tz`" to a real `Date` (UTC instant).
 *
 * The trick: there is no built-in JS API for "this local wall-clock time
 * in this zone → UTC". `Intl.DateTimeFormat` only goes the other way. So
 * we work backwards: take the UTC midnight as a guess, format it back into
 * `tz`, measure the offset, and subtract it. One iteration is enough
 * because the offset is constant across the day except at DST jumps —
 * which occur at 2 AM local, not midnight, so midnight is always
 * unambiguous.
 */
function localMidnightToUtc(date: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  // Start with the assumption that local midnight === UTC midnight.
  const guess = new Date(Date.UTC(y, m - 1, d));
  const offsetMin = tzOffsetMinutes(guess, tz);
  // Local time = UTC + offset. So UTC = Local − offset.
  return new Date(guess.getTime() - offsetMin * 60_000);
}

/**
 * Returns the offset (in minutes) of `tz` from UTC for the given instant.
 * Positive for zones east of UTC, negative for the Americas. DST-aware
 * because `Intl.DateTimeFormat` uses the system tzdata.
 */
function tzOffsetMinutes(instant: Date, tz: string): number {
  // Format the same instant in both UTC and the target zone, then compare
  // the wall-clock components. Whatever they differ by is the offset.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // `hour: "2-digit"` with `hour12: false` returns "24" instead of "00"
  // for local midnight in some Node versions — normalise to 0.
  const hour = get("hour") % 24;
  const local = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return Math.round((local - instant.getTime()) / 60_000);
}
