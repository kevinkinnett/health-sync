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
  router.get("/spo2", wrap((req, res) => controller.getSpo2(req, res)));
  router.get("/breathing-rate", wrap((req, res) => controller.getBreathingRate(req, res)));
  router.get("/skin-temp", wrap((req, res) => controller.getSkinTemp(req, res)));
  router.get("/cardio-score", wrap((req, res) => controller.getCardioScore(req, res)));
  router.get("/eight-sleep", wrap((req, res) => controller.getEightSleep(req, res)));
  router.get("/food", wrap((req, res) => controller.getFood(req, res)));
  router.get(
    "/training-load",
    wrap((req, res) => controller.getTrainingLoad(req, res)),
  );
  router.get("/readiness", wrap((req, res) => controller.getReadiness(req, res)));
  router.get("/driving", wrap((req, res) => controller.getDriving(req, res)));

  return router;
}
