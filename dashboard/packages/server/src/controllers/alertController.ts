import type { Request, Response } from "express";
import type { AlertService } from "../services/alertService.js";

/**
 * HTTP surface for proactive alerts. Handlers throw on failure;
 * `errorMapper` translates. `evaluate` is the endpoint the scheduled
 * Windmill job hits each morning — it returns only the newly-created
 * alerts so the job knows what to forward to Apprise.
 */
export class AlertController {
  constructor(private service: AlertService) {}

  async list(req: Request, res: Response): Promise<void> {
    const requested = typeof req.query.limit === "string"
      ? Number.parseInt(req.query.limit, 10)
      : Number.NaN;
    const limit = Number.isFinite(requested)
      ? Math.max(1, Math.min(requested, 200))
      : 50;
    res.json(await this.service.list(limit));
  }

  async evaluate(_req: Request, res: Response): Promise<void> {
    // Service returns { created, delivery } — the delivery policy tells
    // the scheduled job whether/which/where to push.
    res.json(await this.service.evaluate());
  }

  async markAllRead(_req: Request, res: Response): Promise<void> {
    const updated = await this.service.markAllRead();
    res.json({ updated });
  }
}
