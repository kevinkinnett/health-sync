import { Router } from "express";
import type { HealthController } from "../controllers/healthController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export function createHealthRoutes(controller: HealthController): Router {
  const router = Router();
  const wrap = asyncHandler;

  router.get("/summary", wrap((req, res) => controller.getSummary(req, res)));
  router.get("/activity", wrap((req, res) => controller.getActivity(req, res)));
  router.get("/sleep", wrap((req, res) => controller.getSleep(req, res)));
  router.get("/heart-rate", wrap((req, res) => controller.getHeartRate(req, res)));
  router.get("/weight", wrap((req, res) => controller.getWeight(req, res)));
  router.get("/hrv", wrap((req, res) => controller.getHrv(req, res)));
  router.get("/insights/weekly", wrap((req, res) => controller.getWeeklyInsights(req, res)));
  router.get("/correlations", wrap((req, res) => controller.getCorrelations(req, res)));
  router.get("/heatmap/day-of-week", wrap((req, res) => controller.getDayOfWeekHeatmap(req, res)));
  router.get("/records", wrap((req, res) => controller.getRecords(req, res)));
  router.get("/exercise-logs", wrap((req, res) => controller.getExerciseLogs(req, res)));

  return router;
}
