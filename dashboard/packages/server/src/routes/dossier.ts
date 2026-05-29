import { Router } from "express";
import type { DossierController } from "../controllers/dossierController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Dossier routes. Mounted at `/api/dossier` from `index.ts`.
 *
 *   GET    /:type/:id          -> cached DossierEntry or null
 *   POST   /:type/:id/refresh  -> rebuild + cache, returns the new entry
 *   DELETE /:type/:id          -> 204
 */
export function createDossierRoutes(controller: DossierController): Router {
  const router = Router();
  const wrap = asyncHandler;

  router.get("/:type/:id", wrap((req, res) => controller.get(req, res)));
  router.post("/:type/:id/refresh", wrap((req, res) => controller.refresh(req, res)));
  router.delete("/:type/:id", wrap((req, res) => controller.delete(req, res)));

  return router;
}
