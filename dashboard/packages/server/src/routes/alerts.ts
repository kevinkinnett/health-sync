import { Router } from "express";
import type { AlertController } from "../controllers/alertController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Proactive alert routes, mounted at `/api/alerts`.
 *
 *   GET  /            → recent alerts + unread count (drives the bell)
 *   POST /evaluate    → run detection now, return newly-created alerts
 *                       (called on a schedule by the Windmill job)
 *   POST /read-all    → mark every alert read (the bell "mark all read")
 */
export function createAlertRoutes(controller: AlertController): Router {
  const router = Router();
  const wrap = asyncHandler;

  router.get("/", wrap((req, res) => controller.list(req, res)));
  router.post("/evaluate", wrap((req, res) => controller.evaluate(req, res)));
  router.post("/read-all", wrap((req, res) => controller.markAllRead(req, res)));

  return router;
}
