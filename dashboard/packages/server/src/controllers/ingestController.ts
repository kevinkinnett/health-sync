import type { Request, Response } from "express";
import type { IngestService } from "../services/ingestService.js";

export class IngestController {
  constructor(private service: IngestService) {}

  async getOverview(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const overview = await this.service.getOverview(limit);
      res.json(overview);
    } catch (err) {
      console.error("Error fetching ingest overview:", err);
      res.status(500).json({ error: "Failed to fetch ingest overview" });
    }
  }

  async getState(_req: Request, res: Response): Promise<void> {
    try {
      const state = await this.service.getState();
      res.json(state);
    } catch (err) {
      console.error("Error fetching ingest state:", err);
      res.status(500).json({ error: "Failed to fetch ingest state" });
    }
  }

  async getRuns(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const runs = await this.service.getRuns(limit);
      res.json(runs);
    } catch (err) {
      console.error("Error fetching ingest runs:", err);
      res.status(500).json({ error: "Failed to fetch ingest runs" });
    }
  }

  async trigger(_req: Request, res: Response): Promise<void> {
    try {
      const result = await this.service.triggerRun();
      if (!result.jobId) {
        res.status(409).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      console.error("Error triggering ingest:", err);
      res.status(500).json({ error: "Failed to trigger ingest" });
    }
  }
}
