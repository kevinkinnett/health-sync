/**
 * Server-only timezone helpers for converting between UTC instants
 * (TIMESTAMPTZ in Postgres) and user-local calendar days. **Never** use
 * fixed offsets like `-04:00` here — every helper takes an IANA name
 * (e.g. `America/New_York`) so DST transitions resolve correctly.
 *
 * IMPORTANT — why these are defined here and NOT imported from
 * `@health-dashboard/shared`: the shared package ships as raw `.ts`
 * source (its `package.json` main is `src/index.ts`, no build step),
 * and the server runs as COMPILED JS via plain `node`. The server may
 * only `import type` from shared — a runtime *value* import compiles
 * to a real `import "@health-dashboard/shared"` that Node resolves to
 * `src/index.ts` and dies with `ERR_UNKNOWN_FILE_EXTENSION ".ts"`. So
 * the server keeps its own copy of the pure date helpers. (The client
 * is bundled by Vite, which transpiles TS, so it can safely share
 * runtime code — but the server cannot. If we ever want true runtime
 * dedup, the shared package needs a real build step + dist output.)
 */

/**
 * Returns the local calendar day (`YYYY-MM-DD`) of `instant` as observed
 * in `tz`. The right way to bucket a UTC instant into "what day did this
 * happen for the user" — never use `.toISOString().slice(0, 10)`, which
 * gives the UTC day.
 */
export function formatDateInTz(instant: Date | string, tz: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Returns today's calendar day in `tz` (`YYYY-MM-DD`). */
export function todayInTz(tz: string): string {
  return formatDateInTz(new Date(), tz);
}

/**
 * Adds (or subtracts) calendar days from a `YYYY-MM-DD` string and
 * returns the same shape. Calendar arithmetic — DST-independent.
 *
 * @example addDays("2026-03-08", -7) === "2026-03-01"
 */
export function addDays(date: string, days: number): string {
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

export class LocalDateTimeError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid" | "nonexistent" | "ambiguous",
  ) {
    super(message);
    this.name = "LocalDateTimeError";
  }
}

/**
 * Resolve an offset-free local wall-clock value in an IANA timezone.
 * The round-trip search catches both DST gaps and repeated fall-back times.
 */
export function localDateTimeToUtc(local: string, tz: string): string {
  const match = local.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) {
    throw new LocalDateTimeError(
      "Local date and time must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss",
      "invalid",
    );
  }
  const [, ys, ms, ds, hs, mins, ss = "00"] = match;
  const parts = [ys, ms, ds, hs, mins, ss].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const valid = new Date(naive);
  if (
    valid.getUTCFullYear() !== year ||
    valid.getUTCMonth() !== month - 1 ||
    valid.getUTCDate() !== day ||
    valid.getUTCHours() !== hour ||
    valid.getUTCMinutes() !== minute ||
    valid.getUTCSeconds() !== second
  ) {
    throw new LocalDateTimeError("Local date and time is invalid", "invalid");
  }

  const expected = `${ys}-${ms}-${ds}T${hs}:${mins}:${ss}`;
  const matches: Date[] = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = new Date(naive - offsetMinutes * 60_000);
    if (formatLocalDateTime(candidate, tz) === expected) matches.push(candidate);
  }
  const unique = [...new Map(matches.map((value) => [value.toISOString(), value])).values()];
  if (unique.length === 0) {
    throw new LocalDateTimeError(
      `${local} does not exist in ${tz} because of a daylight-saving transition`,
      "nonexistent",
    );
  }
  if (unique.length > 1) {
    throw new LocalDateTimeError(
      `${local} occurs twice in ${tz}; include an explicit UTC offset`,
      "ambiguous",
    );
  }
  return unique[0].toISOString();
}

function formatLocalDateTime(instant: Date, tz: string): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) =>
    formatted.find((part) => part.type === type)?.value ?? "00";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`;
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
