import type { Request } from "express";
import { BadRequestError } from "../services/errors.js";
import { addDays, todayInTz } from "../services/userTz.js";

/**
 * Shared request-parsing helpers. Every controller used to declare its
 * own `parseId` / `parseLag` / `parseDateRange`; the analytics versions
 * were strict (format + ordering validation), the health versions
 * permissive (accept whatever the client sent). Same data shape, two
 * different contracts. Audit #7 flagged this as a bug magnet.
 *
 * Centralising here means:
 *
 *   - One canonical contract per parameter shape.
 *   - Failures throw `BadRequestError`; `errorMapper` translates to a
 *     consistent 400 response, no controller-level try/catch needed.
 *   - The strict version wins (format check + ordering). The lax
 *     health endpoints inherit the same checks.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_RANGE_DAYS = 30;
export const DEFAULT_MAX_LAG_DAYS = 7;

/**
 * Parses a path/query value as a positive integer id (the universal
 * Postgres surrogate key shape used across this app). Throws
 * `BadRequestError` on missing/non-integer/non-positive input.
 */
export function parseId(raw: unknown, label = "id"): number {
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new BadRequestError(`Invalid ${label}`);
  }
  const n = typeof raw === "number" ? raw : parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return n;
}

/**
 * Parses an optional id. Returns `undefined` when the input is missing
 * or empty (the canonical "not provided" representation in query
 * strings); throws `BadRequestError` only when the input is present
 * but malformed.
 */
export function parseOptionalId(
  raw: unknown,
  label = "id",
): number | undefined {
  if (raw == null || raw === "") return undefined;
  return parseId(raw, label);
}

/**
 * Parses a `lag` query param (used by the supplement/medication
 * correlation endpoints). Defaults to 0; clamped to `[0, max]`.
 */
export function parseLagDays(
  raw: unknown,
  max = DEFAULT_MAX_LAG_DAYS,
): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new BadRequestError("Invalid lag");
  }
  const n = typeof raw === "number" ? raw : parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n > max) {
    throw new BadRequestError(`lag must be an integer in [0, ${max}]`);
  }
  return n;
}

/**
 * Parses `start` and `end` query params as `YYYY-MM-DD`.
 *
 * - Both absent → defaults to the last 30 days in the user's calendar.
 * - One present, one absent → 400 (the controllers used to be
 *   inconsistent here; health silently accepted, analytics 400'd).
 * - Wrong format / `start > end` → 400.
 */
export function parseDateRange(
  req: Request,
  tz: string,
): { start: string; end: string } {
  const start = typeof req.query.start === "string" ? req.query.start : undefined;
  const end = typeof req.query.end === "string" ? req.query.end : undefined;

  if (!start && !end) {
    const today = todayInTz(tz);
    return { start: addDays(today, -DEFAULT_RANGE_DAYS), end: today };
  }
  if (!start || !end) {
    throw new BadRequestError(
      "Both start and end are required when one is provided",
    );
  }
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    throw new BadRequestError("Dates must be YYYY-MM-DD");
  }
  if (start > end) {
    throw new BadRequestError("start must be <= end");
  }
  return { start, end };
}
