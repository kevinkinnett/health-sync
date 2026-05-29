import type { Request, Response } from "express";
import type { DossierItemType } from "@health-dashboard/shared";
import type { DossierService } from "../services/dossierService.js";
import { BadRequestError } from "../services/errors.js";
import { parseId } from "./_params.js";

const ITEM_TYPES: readonly DossierItemType[] = ["supplement", "medication"];

/**
 * Wraps `DossierService` for the HTTP boundary. Endpoints:
 *   GET    /api/dossier/:type/:id          -> DossierEntry | null
 *   POST   /api/dossier/:type/:id/refresh  -> DossierEntry
 *   DELETE /api/dossier/:type/:id          -> 204
 *
 * `:type` must be one of `supplement` | `medication`. `:id` is parsed
 * with the same conventions as the supplement/medication controllers.
 *
 * Throws `BadRequestError` on bad params; `errorMapper` translates.
 */
export class DossierController {
  constructor(private service: DossierService) {}

  async get(req: Request, res: Response): Promise<void> {
    const { type, id } = parseTypeAndId(req);
    res.json(await this.service.get(type, id));
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const { type, id } = parseTypeAndId(req);
    res.json(await this.service.refresh(type, id));
  }

  async delete(req: Request, res: Response): Promise<void> {
    const { type, id } = parseTypeAndId(req);
    await this.service.delete(type, id);
    res.status(204).send();
  }
}

function parseTypeAndId(req: Request): {
  type: DossierItemType;
  id: number;
} {
  const rawType = req.params.type;
  if (!ITEM_TYPES.includes(rawType as DossierItemType)) {
    throw new BadRequestError(
      `Invalid type '${rawType}'. Expected one of: ${ITEM_TYPES.join(", ")}`,
    );
  }
  const id = parseId(req.params.id);
  return { type: rawType as DossierItemType, id };
}
