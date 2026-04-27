import { Router } from "express";
import type { AnalyticsController } from "../controllers/analyticsController.js";

/**
 * Mounts the cross-domain analytics endpoints. Kept under `/api/analytics`
 * (rather than spreading new methods across `/api/health/...` and
 * `/api/supplements/...`) so the per-domain APIs stay focused on raw
 * CRUD while joins-and-rollups live in one place.
 */
export function createAnalyticsRoutes(
  controller: AnalyticsController,
): Router {
  const router = Router();

  // Supplements
  router.get("/supplements/adherence/:itemId", (req, res) =>
    controller.getSupplementAdherence(req, res),
  );
  router.get("/supplements/intake-by-day", (req, res) =>
    controller.getSupplementIntakeByDay(req, res),
  );
  router.get("/supplements/ingredient-by-day", (req, res) =>
    controller.getIngredientByDay(req, res),
  );
  router.get("/supplements/correlations/:itemId", (req, res) =>
    controller.getSupplementCorrelations(req, res),
  );

  // Medications
  router.get("/medications/adherence/:itemId", (req, res) =>
    controller.getMedicationAdherence(req, res),
  );
  router.get("/medications/intake-by-day", (req, res) =>
    controller.getMedicationIntakeByDay(req, res),
  );
  router.get("/medications/correlations/:itemId", (req, res) =>
    controller.getMedicationCorrelations(req, res),
  );

  return router;
}
