import type { Request, Response } from "express";
import type { InterventionService } from "../services/interventions/interventionService.js";
import { parseId } from "./_params.js";
import { todayInTz } from "../services/userTz.js";

/**
 * HTTP surface for interventions.
 *
 * Handlers throw; `middleware/errorMapper` translates service errors into
 * statuses, so there is no per-method try/catch here — same convention as
 * the other controllers.
 */
export class InterventionController {
  private readonly tz: string;

  constructor(
    private readonly service: InterventionService,
    opts: { userTimezone: string } = { userTimezone: "UTC" },
  ) {
    this.tz = opts.userTimezone;
  }

  async list(req: Request, res: Response): Promise<void> {
    const { start, end } = req.query;
    if (typeof start === "string" && typeof end === "string") {
      res.json(await this.service.listOverlapping(start, end));
      return;
    }
    res.json(await this.service.list());
  }

  async get(req: Request, res: Response): Promise<void> {
    res.json(await this.service.get(parseId(req.params.id)));
  }

  async create(req: Request, res: Response): Promise<void> {
    res.status(201).json(await this.service.create(req.body));
  }

  async update(req: Request, res: Response): Promise<void> {
    res.json(await this.service.update(parseId(req.params.id), req.body));
  }

  async remove(req: Request, res: Response): Promise<void> {
    await this.service.remove(parseId(req.params.id));
    res.status(204).end();
  }

  /**
   * Re-derives interventions from logged data. Idempotent, so it is safe
   * to call on a schedule or from a button.
   */
  async refresh(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.refreshDerived(todayInTz(this.tz)));
  }
}
