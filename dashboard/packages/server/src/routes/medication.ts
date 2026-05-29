import { Router } from "express";
import type { MedicationController } from "../controllers/medicationController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export function createMedicationRoutes(controller: MedicationController): Router {
  const router = Router();
  const wrap = asyncHandler;

  router.get("/items", wrap((req, res) => controller.listItems(req, res)));
  router.get("/items/:id", wrap((req, res) => controller.getItem(req, res)));
  router.post("/items", wrap((req, res) => controller.createItem(req, res)));
  router.patch("/items/:id", wrap((req, res) => controller.updateItem(req, res)));
  router.delete("/items/:id", wrap((req, res) => controller.archiveItem(req, res)));

  router.get("/intakes", wrap((req, res) => controller.listIntakes(req, res)));
  router.post("/intakes", wrap((req, res) => controller.createIntake(req, res)));
  router.delete("/intakes/:id", wrap((req, res) => controller.deleteIntake(req, res)));

  return router;
}
