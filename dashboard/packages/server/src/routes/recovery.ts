import { Router } from "express";
import type { RecoveryController } from "../controllers/recoveryController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export function createRecoveryRoutes(controller: RecoveryController): Router {
  const router = Router();
  const wrap = asyncHandler;
  router.get("/activities", wrap((req, res) => controller.listActivities(req, res)));
  router.get("/activities/:id", wrap((req, res) => controller.getActivity(req, res)));
  router.post("/activities", wrap((req, res) => controller.createActivity(req, res)));
  router.patch("/activities/:id", wrap((req, res) => controller.updateActivity(req, res)));
  router.delete("/activities/:id", wrap((req, res) => controller.archiveActivity(req, res)));
  router.get("/sessions", wrap((req, res) => controller.listSessions(req, res)));
  router.post("/sessions", wrap((req, res) => controller.createSession(req, res)));
  router.patch("/sessions/:id", wrap((req, res) => controller.updateSession(req, res)));
  router.delete("/sessions/:id", wrap((req, res) => controller.deleteSession(req, res)));
  router.get("/effects", wrap((req, res) => controller.getEffects(req, res)));
  router.post("/pending-actions/:id/confirm", wrap((req, res) => controller.confirmPendingAction(req, res)));
  router.post("/pending-actions/:id/cancel", wrap((req, res) => controller.cancelPendingAction(req, res)));
  return router;
}
