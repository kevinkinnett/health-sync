import { Router } from "express";
import type { HealthController } from "../controllers/healthController.js";

export function createHealthRoutes(controller: HealthController): Router {
  const router = Router();

  router.get("/summary", (req, res) => controller.getSummary(req, res));
  router.get("/activity", (req, res) => controller.getActivity(req, res));
  router.get("/sleep", (req, res) => controller.getSleep(req, res));
  router.get("/heart-rate", (req, res) => controller.getHeartRate(req, res));
  router.get("/weight", (req, res) => controller.getWeight(req, res));
  router.get("/hrv", (req, res) => controller.getHrv(req, res));
  router.get("/insights/weekly", (req, res) => controller.getWeeklyInsights(req, res));
  router.get("/correlations", (req, res) => controller.getCorrelations(req, res));
  router.get("/heatmap/day-of-week", (req, res) => controller.getDayOfWeekHeatmap(req, res));
  router.get("/exercise-logs", (req, res) => controller.getExerciseLogs(req, res));

  return router;
}
