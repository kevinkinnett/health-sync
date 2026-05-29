/**
 * Client-side timezone helpers. Pure date-string utilities
 * (`addDays`, `formatDateInTz`, `todayInTz`) live in
 * `@health-dashboard/shared` and are re-exported below — same code
 * runs on server and client. Browser-only helpers (currently just
 * `detectBrowserTz`, which reaches for `Intl.DateTimeFormat.resolvedOptions`)
 * stay here.
 */

export { addDays, formatDateInTz, todayInTz } from "@health-dashboard/shared";

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
