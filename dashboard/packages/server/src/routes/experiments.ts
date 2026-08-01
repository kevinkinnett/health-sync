import { Router } from "express";
import type { ExperimentController } from "../controllers/experimentController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

/**
 * Experiment routes, mounted at `/api/experiments`.
 *
 *   GET /summary                        → headline verdicts, for the home screen
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
  // Registered before the parameterised route so "summary" is never
  // parsed as an intervention id.
  router.get(
    "/summary",
    asyncHandler((req, res) => controller.summaries(req, res)),
  );
  router.get(
    "/interventions/:interventionId",
    asyncHandler((req, res) => controller.report(req, res)),
  );
  return router;
}
