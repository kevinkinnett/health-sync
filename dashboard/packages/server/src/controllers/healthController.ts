import type { Request, Response } from "express";
import type { HealthDataService } from "../services/healthDataService.js";
import { todayInTz } from "../services/userTz.js";
import { parseDateRange } from "./_params.js";

/**
 * Read-side controllers for the dashboard's primary metric endpoints.
 *
 * Style note: handlers throw on failure rather than respond manually.
 * `middleware/asyncHandler` forwards errors to `middleware/errorMapper`,
 * which translates known service-layer error types into HTTP statuses.
 * The previous per-method `try { … } catch { res.status(500) … }` is
 * gone — uniform error semantics in one place.
 */
export class HealthController {
  /**
   * IANA timezone — used to compute the default "last 30 days" window
   * against the user's calendar rather than UTC midnight, so a request
   * made just after midnight Eastern doesn't accidentally roll into
   * tomorrow's UTC date.
   */
  private readonly tz: string;

  constructor(
    private service: HealthDataService,
    opts: { userTimezone: string } = { userTimezone: "UTC" },
  ) {
    this.tz = opts.userTimezone;
  }

  async getSummary(_req: Request, res: Response): Promise<void> {
    const summary = await this.service.getSummary();
    res.json(summary);
  }

  async getActivity(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getActivity(start, end));
  }

  async getSleep(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getSleep(start, end));
  }

  async getHeartRate(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getHeartRate(start, end));
  }

  async getWeight(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getWeight(start, end));
  }

  async getHrv(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getHrv(start, end));
  }

  async getExerciseLogs(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getExerciseLogs(start, end));
  }

  async getSpo2(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getSpo2(start, end));
  }

  async getBreathingRate(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getBreathingRate(start, end));
  }

  async getSkinTemp(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getSkinTemp(start, end));
  }

  async getCardioScore(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getCardioScore(start, end));
  }

  async getRecords(_req: Request, res: Response): Promise<void> {
    // Pass "today" in the user's calendar so the streak walker can skip
    // an in-progress final day rather than counting partial-data zeroes
    // as a streak failure.
    res.json(await this.service.getRecords(todayInTz(this.tz)));
  }

  async getDayOfWeekHeatmap(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.getDayOfWeekHeatmap());
  }

  async getCorrelations(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.getCorrelations());
  }

  async getWeeklyInsights(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.getWeeklyInsights());
  }
}
