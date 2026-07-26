import { Router } from "express";
import type { InterventionController } from "../controllers/interventionController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Intervention routes, mounted at `/api/interventions`.
 *
 *   GET    /                  → all, or those overlapping ?start&end
 *   POST   /refresh           → re-derive from logged data (idempotent)
 *   GET    /:id               → one
 *   POST   /                  → create a manual intervention
 *   PATCH  /:id               → partial update (manual rows only)
 *   DELETE /:id               → remove (manual rows only)
 *
 * `/refresh` is declared before `/:id` so the literal path is not
 * swallowed by the parameter route.
 */
export function createInterventionRoutes(
  controller: InterventionController,
): Router {
  const router = Router();
  const wrap = asyncHandler;

  router.get("/", wrap((req, res) => controller.list(req, res)));
  router.post("/refresh", wrap((req, res) => controller.refresh(req, res)));
  router.get("/:id", wrap((req, res) => controller.get(req, res)));
  router.post("/", wrap((req, res) => controller.create(req, res)));
  router.patch("/:id", wrap((req, res) => controller.update(req, res)));
  router.delete("/:id", wrap((req, res) => controller.remove(req, res)));

  return router;
}
