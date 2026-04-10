import type { Request, Response } from "express";
import type { HealthDataService } from "../services/healthDataService.js";

export class HealthController {
  constructor(private service: HealthDataService) {}

  async getSummary(_req: Request, res: Response): Promise<void> {
    try {
      const summary = await this.service.getSummary();
      res.json(summary);
    } catch (err) {
      console.error("Error fetching summary:", err);
      res.status(500).json({ error: "Failed to fetch health summary" });
    }
  }

  async getActivity(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getActivity(start, end);
      res.json(data);
    } catch (err) {
      console.error("Error fetching activity:", err);
      res.status(500).json({ error: "Failed to fetch activity data" });
    }
  }

  async getSleep(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getSleep(start, end);
      res.json(data);
    } catch (err) {
      console.error("Error fetching sleep:", err);
      res.status(500).json({ error: "Failed to fetch sleep data" });
    }
  }

  async getHeartRate(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getHeartRate(start, end);
      res.json(data);
    } catch (err) {
      console.error("Error fetching heart rate:", err);
      res.status(500).json({ error: "Failed to fetch heart rate data" });
    }
  }

  async getWeight(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getWeight(start, end);
      res.json(data);
    } catch (err) {
      console.error("Error fetching weight:", err);
      res.status(500).json({ error: "Failed to fetch weight data" });
    }
  }

  async getHrv(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getHrv(start, end);
      res.json(data);
    } catch (err) {
      console.error("Error fetching HRV:", err);
      res.status(500).json({ error: "Failed to fetch HRV data" });
    }
  }

  async getExerciseLogs(req: Request, res: Response): Promise<void> {
    try {
      const { start, end } = parseDateRange(req);
      const data = await this.service.getExerciseLogs(start, end);
      res.json(data);
    } catch (err) {
      console.error("Error fetching exercise logs:", err);
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
