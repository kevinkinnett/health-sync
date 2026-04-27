import { Router } from "express";
import type { DossierController } from "../controllers/dossierController.js";

/**
 * Dossier routes. Mounted at `/api/dossier` from `index.ts`.
 *
 *   GET    /:type/:id          -> cached DossierEntry or null
 *   POST   /:type/:id/refresh  -> rebuild + cache, returns the new entry
 *   DELETE /:type/:id          -> 204
 */
export function createDossierRoutes(controller: DossierController): Router {
  const router = Router();

  router.get("/:type/:id", (req, res) => controller.get(req, res));
  router.post("/:type/:id/refresh", (req, res) =>
    controller.refresh(req, res),
  );
  router.delete("/:type/:id", (req, res) => controller.delete(req, res));

  return router;
}
