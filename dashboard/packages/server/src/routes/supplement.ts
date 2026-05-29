import { Router } from "express";
import type { SupplementController } from "../controllers/supplementController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export function createSupplementRoutes(controller: SupplementController): Router {
  const router = Router();
  const wrap = asyncHandler;

  router.get("/items", wrap((req, res) => controller.listItems(req, res)));
  router.get("/items/:id", wrap((req, res) => controller.getItem(req, res)));
  router.post("/items", wrap((req, res) => controller.createItem(req, res)));
  router.patch("/items/:id", wrap((req, res) => controller.updateItem(req, res)));
  router.delete("/items/:id", wrap((req, res) => controller.archiveItem(req, res)));

  // Composition (per-item)
  router.get("/items/:id/ingredients", wrap((req, res) => controller.getItemIngredients(req, res)));
  router.put("/items/:id/ingredients", wrap((req, res) => controller.setItemIngredients(req, res)));

  router.get("/intakes", wrap((req, res) => controller.listIntakes(req, res)));
  router.post("/intakes", wrap((req, res) => controller.createIntake(req, res)));
  router.delete("/intakes/:id", wrap((req, res) => controller.deleteIntake(req, res)));

  // Ingredient catalog (cross-item)
  router.get("/ingredients", wrap((req, res) => controller.listIngredients(req, res)));
  router.post("/ingredients", wrap((req, res) => controller.createIngredient(req, res)));
  router.patch("/ingredients/:id", wrap((req, res) => controller.updateIngredient(req, res)));
  router.delete("/ingredients/:id", wrap((req, res) => controller.deleteIngredient(req, res)));

  return router;
}
