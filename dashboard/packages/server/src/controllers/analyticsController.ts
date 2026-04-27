import type { Request, Response } from "express";
import {
  AnalyticsNotFoundError,
  type AnalyticsService,
} from "../services/analyticsService.js";
import { logger } from "../logger.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LAG_DAYS = 7;

/**
 * Thin HTTP layer over {@link AnalyticsService}. Validates query/path
 * parameters before delegating; errors fall through to {@link handleError}
 * so all routes share a consistent failure shape.
 */
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  // ---- Supplements ----------------------------------------------------------

  async getSupplementAdherence(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.itemId);
      if (id == null) {
        res.status(400).json({ error: "Invalid itemId" });
        return;
      }
      const range = parseDateRange(req);
      if ("error" in range) {
        res.status(400).json({ error: range.error });
        return;
      }
      const data = await this.service.getSupplementAdherence(
        id,
        range.start,
        range.end,
      );
      res.json(data);
    } catch (err) {
      this.handleError(err, res, "Failed to fetch supplement adherence");
    }
  }

  async getSupplementIntakeByDay(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if ("error" in range) {
        res.status(400).json({ error: range.error });
        return;
      }
      const itemId = parseOptionalId(req.query.itemId);
      if (itemId === "invalid") {
        res.status(400).json({ error: "Invalid itemId" });
        return;
      }
      const data = await this.service.getSupplementIntakeByDay(
        range.start,
        range.end,
        itemId ?? undefined,
      );
      res.json(data);
    } catch (err) {
      this.handleError(err, res, "Failed to fetch supplement intake by day");
    }
  }

  async getIngredientByDay(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if ("error" in range) {
        res.status(400).json({ error: range.error });
        return;
      }
      const ingredientId = parseOptionalId(req.query.ingredientId);
      if (ingredientId === "invalid") {
        res.status(400).json({ error: "Invalid ingredientId" });
        return;
      }
      const data = await this.service.getIngredientByDay(
        range.start,
        range.end,
        ingredientId ?? undefined,
      );
      res.json(data);
    } catch (err) {
      this.handleError(err, res, "Failed to fetch ingredient rollup");
    }
  }

  async getSupplementCorrelations(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const id = parseId(req.params.itemId);
      if (id == null) {
        res.status(400).json({ error: "Invalid itemId" });
        return;
      }
      const lag = parseLag(req.query.lag);
      if (lag === "invalid") {
        res.status(400).json({
          error: `Invalid lag (must be integer 0..${MAX_LAG_DAYS})`,
        });
        return;
      }
      const data = await this.service.getSupplementCorrelations(id, lag);
      res.json(data);
    } catch (err) {
      this.handleError(err, res, "Failed to fetch supplement correlations");
    }
  }

  // ---- Medications ----------------------------------------------------------

  async getMedicationAdherence(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.itemId);
      if (id == null) {
        res.status(400).json({ error: "Invalid itemId" });
        return;
      }
      const range = parseDateRange(req);
      if ("error" in range) {
        res.status(400).json({ error: range.error });
        return;
      }
      const data = await this.service.getMedicationAdherence(
        id,
        range.start,
        range.end,
      );
      res.json(data);
    } catch (err) {
      this.handleError(err, res, "Failed to fetch medication adherence");
    }
  }

  async getMedicationIntakeByDay(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if ("error" in range) {
        res.status(400).json({ error: range.error });
        return;
      }
      const itemId = parseOptionalId(req.query.itemId);
      if (itemId === "invalid") {
        res.status(400).json({ error: "Invalid itemId" });
        return;
      }
      const data = await this.service.getMedicationIntakeByDay(
        range.start,
        range.end,
        itemId ?? undefined,
      );
      res.json(data);
    } catch (err) {
      this.handleError(err, res, "Failed to fetch medication intake by day");
    }
  }

  async getMedicationCorrelations(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const id = parseId(req.params.itemId);
      if (id == null) {
        res.status(400).json({ error: "Invalid itemId" });
        return;
      }
      const lag = parseLag(req.query.lag);
      if (lag === "invalid") {
        res.status(400).json({
          error: `Invalid lag (must be integer 0..${MAX_LAG_DAYS})`,
        });
        return;
      }
      const data = await this.service.getMedicationCorrelations(id, lag);
      res.json(data);
    } catch (err) {
      this.handleError(err, res, "Failed to fetch medication correlations");
    }
  }

  private handleError(err: unknown, res: Response, logMessage: string): void {
    if (err instanceof AnalyticsNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    logger.error({ err }, logMessage);
    res.status(500).json({ error: logMessage });
  }
}

function parseId(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Returns:
 *   - the parsed id if present and valid
 *   - `null` if the param is absent
 *   - `"invalid"` if it's present but not a positive integer (caller
 *      should respond with 400)
 */
function parseOptionalId(raw: unknown): number | null | "invalid" {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string") return "invalid";
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return "invalid";
  return n;
}

function parseLag(raw: unknown): number | "invalid" {
  if (raw == null || raw === "") return 0;
  if (typeof raw !== "string") return "invalid";
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n > MAX_LAG_DAYS) return "invalid";
  return n;
}

/**
 * Parses `start` and `end` query parameters as `YYYY-MM-DD` strings.
 * Defaults to the last 30 days when both are absent (matching the
 * default behaviour of the existing health endpoints). Returns an
 * `{ error }` object when either is present but malformed so the
 * caller can return a 400.
 */
function parseDateRange(
  req: Request,
):
  | { start: string; end: string }
  | { error: string } {
  const start = req.query.start as string | undefined;
  const end = req.query.end as string | undefined;
  if (!start && !end) {
    const now = new Date();
    const thirty = new Date(now);
    thirty.setUTCDate(now.getUTCDate() - 30);
    return {
      start: thirty.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    };
  }
  if (!start || !end) {
    return { error: "Both start and end are required when one is provided" };
  }
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return { error: "Dates must be YYYY-MM-DD" };
  }
  if (start > end) {
    return { error: "start must be <= end" };
  }
  return { start, end };
}
