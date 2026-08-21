/**
 * Client-side timezone helpers. Defined locally (not imported from
 * `@health-dashboard/shared`) to keep the shared package types-only —
 * the server runs compiled JS and cannot import runtime values from
 * shared's raw `.ts` source, so to avoid a split where only the client
 * could share these, the canonical home for the runtime date helpers
 * is each runtime's own `userTz`. See the server's `userTz.ts` for the
 * full rationale.
 */

/**
 * Returns the local calendar day (`YYYY-MM-DD`) of `instant` as observed
 * in `tz`. Never use `.toISOString().slice(0, 10)` — that gives the UTC
 * day, which is wrong for late-evening events in western zones.
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
 * Adds (or subtracts) calendar days from a `YYYY-MM-DD` string. Calendar
 * arithmetic — DST-independent.
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

export function formatLocalDateTimeInput(
  instant: Date | string,
  tz: string,
): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

export function localDateTimeToUtc(local: string, tz: string): string {
  const match = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("Choose a valid date and time.");
  const [, year, month, day, hour, minute] = match;
  const naive = Date.UTC(+year, +month - 1, +day, +hour, +minute);
  const expected = `${year}-${month}-${day}T${hour}:${minute}`;
  const candidates: Date[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = new Date(naive - offset * 60_000);
    if (formatLocalDateTimeInput(candidate, tz) === expected) candidates.push(candidate);
  }
  const unique = [...new Map(candidates.map((date) => [date.toISOString(), date])).values()];
  if (unique.length === 0) throw new Error("That local time does not exist because the clock changes for daylight saving time.");
  if (unique.length > 1) throw new Error("That local time occurs twice because the clock changes. Choose a time outside the repeated hour.");
  return unique[0].toISOString();
}
