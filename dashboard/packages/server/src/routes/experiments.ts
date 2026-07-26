import { Router } from "express";
import type { ExperimentController } from "../controllers/experimentController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Experiment routes, mounted at `/api/experiments`.
 *
 *   GET /interventions/:interventionId  → the "did it work?" report
 *
 * Nested under `/interventions/` because the report is always *about* an
 * intervention; leaving room for other subjects (a date, an ad-hoc
 * changepoint) without a breaking rename later.
 */
export function createExperimentRoutes(
  controller: ExperimentController,
): Router {
  const router = Router();
  router.get(
    "/interventions/:interventionId",
    asyncHandler((req, res) => controller.report(req, res)),
  );
  return router;
}
