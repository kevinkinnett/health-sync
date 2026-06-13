import type { Request, Response } from "express";
import type { AnalyticsService } from "../services/analyticsService.js";
import { parseDateRange, parseId, parseOptionalId, parseLagDays } from "./_params.js";

/**
 * Thin HTTP layer over {@link AnalyticsService}. Handlers throw on
 * failure; `middleware/errorMapper` translates `BadRequestError` →
 * 400, `AnalyticsNotFoundError` → 404, etc. No per-method try/catch
 * boilerplate.
 */
export class AnalyticsController {
  /**
   * IANA timezone — only used when the caller omits `start`/`end` so
   * we can compute "the last 30 days" against the user's calendar
   * rather than the server's UTC midnight.
   */
  private readonly tz: string;

  constructor(
    private service: AnalyticsService,
    opts: { userTimezone: string } = { userTimezone: "UTC" },
  ) {
    this.tz = opts.userTimezone;
  }

  // ---- Supplements -----------------------------------------------------

  async getSupplementAdherence(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.itemId, "itemId");
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getSupplementAdherence(id, start, end));
  }

  async getSupplementIntakeByDay(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    const itemId = parseOptionalId(req.query.itemId, "itemId");
    res.json(await this.service.getSupplementIntakeByDay(start, end, itemId));
  }

  async getIngredientByDay(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    const ingredientId = parseOptionalId(req.query.ingredientId, "ingredientId");
    res.json(await this.service.getIngredientByDay(start, end, ingredientId));
  }

  async getSupplementCorrelations(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.itemId, "itemId");
    const lag = parseLagDays(req.query.lag);
    res.json(await this.service.getSupplementCorrelations(id, lag));
  }

  // ---- Medications -----------------------------------------------------

  async getMedicationAdherence(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.itemId, "itemId");
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getMedicationAdherence(id, start, end));
  }

  async getMedicationIntakeByDay(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    const itemId = parseOptionalId(req.query.itemId, "itemId");
    res.json(await this.service.getMedicationIntakeByDay(start, end, itemId));
  }

  async getMedicationCorrelations(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.itemId, "itemId");
    const lag = parseLagDays(req.query.lag);
    res.json(await this.service.getMedicationCorrelations(id, lag));
  }

  async getMedicationDoseResponse(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.itemId, "itemId");
    res.json(await this.service.getMedicationDoseResponse(id));
  }
}
