import { Router } from "express";
import type { SupplementController } from "../controllers/supplementController.js";

export function createSupplementRoutes(controller: SupplementController): Router {
  const router = Router();

  router.get("/items", (req, res) => controller.listItems(req, res));
  router.get("/items/:id", (req, res) => controller.getItem(req, res));
  router.post("/items", (req, res) => controller.createItem(req, res));
  router.patch("/items/:id", (req, res) => controller.updateItem(req, res));
  router.delete("/items/:id", (req, res) => controller.archiveItem(req, res));

  // Composition (per-item)
  router.get("/items/:id/ingredients", (req, res) =>
    controller.getItemIngredients(req, res),
  );
  router.put("/items/:id/ingredients", (req, res) =>
    controller.setItemIngredients(req, res),
  );

  router.get("/intakes", (req, res) => controller.listIntakes(req, res));
  router.post("/intakes", (req, res) => controller.createIntake(req, res));
  router.delete("/intakes/:id", (req, res) => controller.deleteIntake(req, res));

  // Ingredient catalog (cross-item)
  router.get("/ingredients", (req, res) =>
    controller.listIngredients(req, res),
  );
  router.post("/ingredients", (req, res) =>
    controller.createIngredient(req, res),
  );
  router.patch("/ingredients/:id", (req, res) =>
    controller.updateIngredient(req, res),
  );
  router.delete("/ingredients/:id", (req, res) =>
    controller.deleteIngredient(req, res),
  );

  return router;
}
