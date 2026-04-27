/**
 * Client-side timezone helpers — mirror of `server/src/services/userTz.ts`.
 * Use IANA names like `America/New_York`, never fixed offsets, so DST
 * transitions resolve correctly via the browser's bundled tzdata.
 *
 * Why duplicate the server file: keeping the client and server packages
 * dependency-free of each other (they only share types via
 * `@health-dashboard/shared`) avoids cross-package runtime coupling and
 * lets us tweak the implementation on either side without breaking the
 * other.
 */

/**
 * Returns the local calendar day (`YYYY-MM-DD`) of `instant` as observed
 * in `tz`. The right way to bucket a UTC instant into "what day did this
 * happen for the user" — never use `.toISOString().slice(0,10)`.
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
 * Returns today's calendar day in `tz` (`YYYY-MM-DD`).
 */
export function todayInTz(tz: string): string {
  return formatDateInTz(new Date(), tz);
}

/**
 * Adds (or subtracts) calendar days from a `YYYY-MM-DD` string. Operates
 * on the calendar — independent of any timezone — so the result is always
 * exactly N days earlier/later regardless of DST.
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
 * Returns the browser's IANA timezone, falling back to `UTC` on the
 * (vanishingly rare) browser that doesn't expose `Intl.DateTimeFormat`
 * with timezone resolution. Useful as a default before the server-side
 * config has loaded.
 */
export function detectBrowserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
