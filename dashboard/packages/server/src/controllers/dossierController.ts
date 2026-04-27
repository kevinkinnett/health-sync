import type { Request, Response } from "express";
import { ZodError } from "zod";
import type { DossierItemType } from "@health-dashboard/shared";
import {
  DossierFetchError,
  DossierNotFoundError,
  type DossierService,
} from "../services/dossierService.js";
import { logger } from "../logger.js";

const ITEM_TYPES: readonly DossierItemType[] = ["supplement", "medication"];

/**
 * Wraps `DossierService` for the HTTP boundary. Endpoints:
 *   GET    /api/dossier/:type/:id          -> DossierEntry | null
 *   POST   /api/dossier/:type/:id/refresh  -> DossierEntry
 *   DELETE /api/dossier/:type/:id          -> 204
 *
 * `:type` must be one of `supplement` | `medication`. `:id` is parsed with
 * the same conventions as the supplement/medication controllers.
 */
export class DossierController {
  constructor(private service: DossierService) {}

  async get(req: Request, res: Response): Promise<void> {
    try {
      const params = parseTypeAndId(req);
      if ("error" in params) {
        res.status(400).json({ error: params.error });
        return;
      }
      const entry = await this.service.get(params.type, params.id);
      res.json(entry);
    } catch (err) {
      this.handleError(err, res, "Failed to get dossier");
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const params = parseTypeAndId(req);
      if ("error" in params) {
        res.status(400).json({ error: params.error });
        return;
      }
      const entry = await this.service.refresh(params.type, params.id);
      res.json(entry);
    } catch (err) {
      this.handleError(err, res, "Failed to refresh dossier");
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const params = parseTypeAndId(req);
      if ("error" in params) {
        res.status(400).json({ error: params.error });
        return;
      }
      await this.service.delete(params.type, params.id);
      res.status(204).send();
    } catch (err) {
      this.handleError(err, res, "Failed to delete dossier");
    }
  }

  private handleError(err: unknown, res: Response, logMessage: string): void {
    if (err instanceof ZodError) {
      res
        .status(400)
        .json({ error: "Invalid request body", issues: err.issues });
      return;
    }
    if (err instanceof DossierNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof DossierFetchError) {
      logger.warn({ err: String(err), cause: err.cause }, logMessage);
      res.status(502).json({ error: err.message });
      return;
    }
    logger.error({ err }, logMessage);
    res.status(500).json({ error: logMessage });
  }
}

function parseTypeAndId(
  req: Request,
): { type: DossierItemType; id: number } | { error: string } {
  const rawType = req.params.type;
  if (!ITEM_TYPES.includes(rawType as DossierItemType)) {
    return {
      error: `Invalid type '${rawType}'. Expected one of: ${ITEM_TYPES.join(", ")}`,
    };
  }
  const id = parseId(req.params.id);
  if (id == null) return { error: "Invalid id" };
  return { type: rawType as DossierItemType, id };
}

function parseId(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}
