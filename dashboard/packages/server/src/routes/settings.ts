import { Router } from "express";
import type { SettingsController } from "../controllers/settingsController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Settings routes, mounted at `/api/settings`.
 *
 *   GET  /notifications       → current notification settings (UI load)
 *   PUT  /notifications       → validate + clamp + persist, returns saved
 *   POST /notifications/test  → fire a one-off test push via Apprise
 */
export function createSettingsRoutes(controller: SettingsController): Router {
  const router = Router();
  const wrap = asyncHandler;

  router.get(
    "/notifications",
    wrap((req, res) => controller.getNotifications(req, res)),
  );
  router.put(
    "/notifications",
    wrap((req, res) => controller.updateNotifications(req, res)),
  );
  router.post(
    "/notifications/test",
    wrap((req, res) => controller.testNotification(req, res)),
  );

  return router;
}
