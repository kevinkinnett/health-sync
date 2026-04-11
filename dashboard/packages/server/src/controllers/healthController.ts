import type { Request, Response } from "express";
import type { HealthDataService } from "../services/healthDataService.js";
import { logger } from "../logger.js";

export class HealthController {
  constructor(private service: HealthDataService) {}

  async getSummary(_req: Request, res: Response): Promise<void> {
    try {
      const summary = await this.service.getSummary();
      res.json(summary);
    } catch (err) {
      logger.error({ err }, "Failed to fetch health summary");
      res.status(500).json({ error: "Failed to fetch health summary" });
    }
  }

  async getActivity(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getActivity(start, end);
      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch activity data");
      res.status(500).json({ error: "Failed to fetch activity data" });
    }
  }

  async getSleep(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getSleep(start, end);
      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch sleep data");
      res.status(500).json({ error: "Failed to fetch sleep data" });
    }
  }

  async getHeartRate(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getHeartRate(start, end);
      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch heart rate data");
      res.status(500).json({ error: "Failed to fetch heart rate data" });
    }
  }

  async getWeight(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getWeight(start, end);
      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch weight data");
      res.status(500).json({ error: "Failed to fetch weight data" });
    }
  }

  async getHrv(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getHrv(start, end);
      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch HRV data");
      res.status(500).json({ error: "Failed to fetch HRV data" });
    }
  }

  async getDayOfWeekHeatmap(_req: Request, res: Response): Promise<void> {
    try {
      const data = await this.service.getDayOfWeekHeatmap();
      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch day-of-week heatmap");
      res.status(500).json({ error: "Failed to fetch day-of-week heatmap" });
    }
  }

  async getCorrelations(_req: Request, res: Response): Promise<void> {
    try {
      const data = await this.service.getCorrelations();
      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch correlations");
      res.status(500).json({ error: "Failed to fetch correlations" });
    }
  }

  async getWeeklyInsights(_req: Request, res: Response): Promise<void> {
    try {
      const insights = await this.service.getWeeklyInsights();
      res.json(insights);
    } catch (err) {
      logger.error({ err }, "Failed to fetch weekly insights");
      res.status(500).json({ error: "Failed to fetch weekly insights" });
    }
  }

  async getExerciseLogs(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getExerciseLogs(start, end);
      res.json(data);
    } catch (err) {
      logger.error({ err }, "Failed to fetch exercise logs");
      res.status(500).json({ error: "Failed to fetch exercise logs" });
    }
  }
}

function parseDateRange(req: Request): { start: string; end: string } {
  const start = req.query.start as string | undefined;
  const end = req.query.end as string | undefined;

  if (!start || !end) {
    // Default to last 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    return {
      start: thirtyDaysAgo.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    };
  }

  return { start, end };
}
