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

  async list(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.list());
  }

  async evaluate(_req: Request, res: Response): Promise<void> {
    const created = await this.service.evaluate();
    res.json({ created });
  }

  async markAllRead(_req: Request, res: Response): Promise<void> {
    const updated = await this.service.markAllRead();
    res.json({ updated });
  }
}
