/**
 * Timezone helpers for converting between UTC instants (TIMESTAMPTZ in
 * Postgres) and user-local calendar days. **Never** use fixed offsets like
 * `-04:00` here — every helper takes an IANA name (e.g. `America/New_York`)
 * so DST transitions resolve correctly.
 *
 * The implementation is dependency-free, leaning on `Intl.DateTimeFormat`
 * which all modern Node versions ship with full tzdata support for.
 */

/**
 * Returns the local calendar day (`YYYY-MM-DD`) of `instant` as observed
 * in `tz`. This is the right way to bucket TIMESTAMPTZ events into
 * "what day did this happen for the user" — never use `.toISOString().slice(0,10)`.
 *
 * @example
 *   formatDateInTz("2026-04-26T23:00:00-04:00", "America/New_York") === "2026-04-26"
 *   formatDateInTz("2026-04-26T23:00:00-04:00", "UTC")              === "2026-04-27"
 */
export function formatDateInTz(instant: Date | string, tz: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  // `en-CA` formats as YYYY-MM-DD natively, sidestepping locale tweaks.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Returns today's calendar day in `tz` (`YYYY-MM-DD`). Equivalent to
 * `formatDateInTz(new Date(), tz)` but slightly more readable at call sites
 * computing date-range presets.
 */
export function todayInTz(tz: string): string {
  return formatDateInTz(new Date(), tz);
}

/**
 * Adds (or subtracts) calendar days from a `YYYY-MM-DD` string. Operates on
 * the calendar — independent of any timezone — so the result is always
 * exactly N days earlier/later regardless of DST. Used for "today minus 30
 * days" style date-range math where the user thinks in calendar days.
 *
 * @example
 *   addDays("2026-03-08", -7) === "2026-03-01"  // unaffected by DST gap
 */
export function addDays(date: string, days: number): string {
  // Parse as UTC midnight → arithmetic in UTC → format back. Never bridges
  // a DST boundary because UTC has no DST. The `Date` here is a stand-in
  // for "the calendar day", not a real instant.
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000;
  const dt = new Date(t);
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, "0"),
    String(dt.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

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
