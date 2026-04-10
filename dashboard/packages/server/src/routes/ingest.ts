import { Router } from "express";
import type { IngestController } from "../controllers/ingestController.js";

export function createIngestRoutes(controller: IngestController): Router {
  const router = Router();

  router.get("/overview", (req, res) => controller.getOverview(req, res));
  router.get("/state", (req, res) => controller.getState(req, res));
  router.get("/runs", (req, res) => controller.getRuns(req, res));
  router.post("/trigger", (req, res) => controller.trigger(req, res));

  return router;
}
