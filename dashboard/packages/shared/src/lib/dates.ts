/**
 * Pure date-string utilities shared by the server and client.
 *
 * Every function in this file takes and returns `YYYY-MM-DD` strings;
 * none reaches for a runtime clock. `Intl.DateTimeFormat` is the only
 * platform API used and it's available in both Node and modern
 * browsers, so the same code path runs on both sides — and the same
 * unit tests cover both.
 *
 * Replaces three previous implementations:
 *
 * - `server/src/services/stats.ts:shiftDate`
 * - `server/src/services/userTz.ts:addDays` / `formatDateInTz` /
 *   `todayInTz`
 * - `client/src/lib/userTz.ts:addDays` / `formatDateInTz` /
 *   `todayInTz`
 *
 * Browser-specific helpers (e.g. `detectBrowserTz`) stay in
 * `client/src/lib/userTz.ts`.
 */

/**
 * Returns the local calendar day (`YYYY-MM-DD`) of `instant` as
 * observed in `tz`. The right way to bucket a UTC instant into "what
 * day did this happen for the user" — never use
 * `.toISOString().slice(0, 10)`, which gives the UTC day.
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

/** Returns today's calendar day in `tz` (`YYYY-MM-DD`). */
export function todayInTz(tz: string): string {
  return formatDateInTz(new Date(), tz);
}

/**
 * Adds (or subtracts) calendar days from a `YYYY-MM-DD` string and
 * returns the same shape. Operates on the calendar — independent of
 * any timezone — so the result is always exactly N days earlier or
 * later regardless of DST.
 *
 * @example
 *   addDays("2026-03-08", -7) === "2026-03-01"  // unaffected by DST gap
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
