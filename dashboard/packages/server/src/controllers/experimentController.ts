import type { Request, Response } from "express";
import type { ExperimentService } from "../services/experiments/experimentService.js";
import { parseId } from "./_params.js";
import { todayInTz } from "../services/userTz.js";
import { NotFoundError } from "../services/errors.js";

/**
 * HTTP surface for the "did it work?" report.
 *
 * `today` is resolved here, at the edge, and passed down — the engine
 * itself never reads a clock, which is what keeps its window arithmetic
 * testable.
 */
export class ExperimentController {
  private readonly tz: string;

  constructor(
    private readonly service: ExperimentService,
    opts: { userTimezone: string } = { userTimezone: "UTC" },
  ) {
    this.tz = opts.userTimezone;
  }

  async report(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.interventionId, "interventionId");
    try {
      res.json(await this.service.report(id, todayInTz(this.tz)));
    } catch (err) {
      // The engine is storage-agnostic and signals a missing subject with
      // a plain Error; translate it to the shared 404 type here so the
      // error mapper produces the right status.
      if ((err as Error).message?.includes("not found")) {
        throw new NotFoundError(`Intervention ${id} not found`);
      }
      throw err;
    }
  }
}
