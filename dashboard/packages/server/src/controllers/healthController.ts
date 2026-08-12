import type { Request, Response } from "express";
import type { HealthDataService } from "../services/healthDataService.js";
import type { TrainingService } from "../services/training/trainingService.js";
import { todayInTz } from "../services/userTz.js";
import { parseDateRange } from "./_params.js";
import {
  healthSummaryResponseSchema,
  readinessResponseSchema,
  recoveryAnomalyResponseSchema,
} from "../contracts/dashboardContracts.js";

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
    private training: TrainingService,
    opts: { userTimezone: string } = { userTimezone: "UTC" },
  ) {
    this.tz = opts.userTimezone;
  }

  async getSummary(_req: Request, res: Response): Promise<void> {
    const summary = await this.service.getSummary();
    res.json(healthSummaryResponseSchema.parse(summary));
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

  async getEightSleep(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getEightSleep(start, end));
  }

  async getFood(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getFood(start, end));
  }

  /**
   * Step-independent effort. The rest of this controller reports what
   * a pedometer sees; this reports what the heart did, so resistance
   * work is not invisible.
   */
  async getTrainingLoad(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.training.getSummary(start, end));
  }

  async getReadiness(req: Request, res: Response): Promise<void> {
    // Optional `?days=` controls the trend length. The dashboard card
    // omits it (short 14-day glance); the detail screen asks for ~45.
    // Clamp so the 90-day input window always covers it + the 30-day
    // baseline each history point needs.
    const raw = Number(req.query.days);
    const historyDays = Number.isFinite(raw)
      ? Math.min(60, Math.max(7, Math.trunc(raw)))
      : undefined;
    res.json(readinessResponseSchema.parse(await this.service.getReadiness(historyDays)));
  }

  async getDriving(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.getDriving());
  }

  async getRecords(_req: Request, res: Response): Promise<void> {
    // Pass "today" in the user's calendar so the streak walker can skip
    // an in-progress final day rather than counting partial-data zeroes
    // as a streak failure.
    res.json(await this.service.getRecords(todayInTz(this.tz)));
  }

  async getDayOfWeekHeatmap(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.getDayOfWeekHeatmap(todayInTz(this.tz)));
  }

  async getCorrelations(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.getCorrelations(todayInTz(this.tz)));
  }

  async getWeeklyInsights(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.getWeeklyInsights(todayInTz(this.tz)));
  }

  async getSensorAgreement(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(await this.service.getSensorAgreement(start, end, this.tz));
  }

  async getRecoveryAnomalies(req: Request, res: Response): Promise<void> {
    const { start, end } = parseDateRange(req, this.tz);
    res.json(recoveryAnomalyResponseSchema.parse(
      await this.service.getRecoveryAnomalies(start, end, todayInTz(this.tz)),
    ));
  }
}
