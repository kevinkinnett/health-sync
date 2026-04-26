import type { Request, Response } from "express";
import { z, ZodError } from "zod";
import {
  NotFoundError,
  ValidationError,
  type SupplementService,
} from "../services/supplementService.js";
import { logger } from "../logger.js";

const createItemSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  brand: z.string().trim().nullable().optional(),
  form: z.string().trim().nullable().optional(),
  defaultAmount: z.number().nonnegative().nullable().optional(),
  defaultUnit: z.string().trim().min(1, "defaultUnit is required"),
  notes: z.string().nullable().optional(),
});

const updateItemSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    brand: z.string().trim().nullable().optional(),
    form: z.string().trim().nullable().optional(),
    defaultAmount: z.number().nonnegative().nullable().optional(),
    defaultUnit: z.string().trim().min(1).optional(),
    notes: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const createIntakeSchema = z.object({
  itemId: z.number().int().positive(),
  takenAt: z.string().datetime({ offset: true }).optional(),
  amount: z.number().nonnegative().optional(),
  unit: z.string().trim().min(1).optional(),
  notes: z.string().nullable().optional(),
});

const createIngredientSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  notes: z.string().nullable().optional(),
});

const updateIngredientSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

const compositionRowSchema = z
  .object({
    ingredientId: z.number().int().positive().optional(),
    ingredientName: z.string().trim().min(1).optional(),
    amount: z.number().nonnegative(),
    unit: z.string().trim().min(1),
    sortOrder: z.number().int().nonnegative().optional(),
  })
  .refine(
    (row) => row.ingredientId != null || (row.ingredientName?.length ?? 0) > 0,
    { message: "Each row needs ingredientId or ingredientName" },
  );

const setCompositionSchema = z.object({
  ingredients: z.array(compositionRowSchema),
});

export class SupplementController {
  constructor(private service: SupplementService) {}

  // ---- Items ----------------------------------------------------------------

  async listItems(req: Request, res: Response): Promise<void> {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const items = await this.service.listItems(includeInactive);
      res.json(items);
    } catch (err) {
      logger.error({ err }, "Failed to list supplement items");
      res.status(500).json({ error: "Failed to list supplement items" });
    }
  }

  async getItem(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.id);
      if (id == null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const item = await this.service.getItem(id);
      res.json(item);
    } catch (err) {
      this.handleError(err, res, "Failed to get supplement item");
    }
  }

  async createItem(req: Request, res: Response): Promise<void> {
    try {
      const body = createItemSchema.parse(req.body);
      const item = await this.service.createItem(body);
      res.status(201).json(item);
    } catch (err) {
      this.handleError(err, res, "Failed to create supplement item");
    }
  }

  async updateItem(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.id);
      if (id == null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const body = updateItemSchema.parse(req.body);
      const item = await this.service.updateItem(id, body);
      res.json(item);
    } catch (err) {
      this.handleError(err, res, "Failed to update supplement item");
    }
  }

  async archiveItem(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.id);
      if (id == null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      await this.service.archiveItem(id);
      res.status(204).send();
    } catch (err) {
      this.handleError(err, res, "Failed to archive supplement item");
    }
  }

  // ---- Intakes --------------------------------------------------------------

  async listIntakes(req: Request, res: Response): Promise<void> {
    try {
      const start = typeof req.query.start === "string" ? req.query.start : undefined;
      const end = typeof req.query.end === "string" ? req.query.end : undefined;
      const itemIdRaw =
        typeof req.query.itemId === "string" ? req.query.itemId : undefined;
      const itemId = itemIdRaw != null ? parseId(itemIdRaw) : null;
      if (itemIdRaw != null && itemId == null) {
        res.status(400).json({ error: "Invalid itemId" });
        return;
      }
      const intakes = await this.service.listIntakes(
        start,
        end,
        itemId ?? undefined,
      );
      res.json(intakes);
    } catch (err) {
      logger.error({ err }, "Failed to list supplement intakes");
      res.status(500).json({ error: "Failed to list supplement intakes" });
    }
  }

  async createIntake(req: Request, res: Response): Promise<void> {
    try {
      const body = createIntakeSchema.parse(req.body);
      const intake = await this.service.logIntake(body);
      res.status(201).json(intake);
    } catch (err) {
      this.handleError(err, res, "Failed to log supplement intake");
    }
  }

  async deleteIntake(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.id);
      if (id == null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      await this.service.deleteIntake(id);
      res.status(204).send();
    } catch (err) {
      this.handleError(err, res, "Failed to delete supplement intake");
    }
  }

  // ---- Ingredients ----------------------------------------------------------

  async listIngredients(_req: Request, res: Response): Promise<void> {
    try {
      const ingredients = await this.service.listIngredients();
      res.json(ingredients);
    } catch (err) {
      logger.error({ err }, "Failed to list ingredients");
      res.status(500).json({ error: "Failed to list ingredients" });
    }
  }

  async createIngredient(req: Request, res: Response): Promise<void> {
    try {
      const body = createIngredientSchema.parse(req.body);
      const ingredient = await this.service.createIngredient(body);
      res.status(201).json(ingredient);
    } catch (err) {
      this.handleError(err, res, "Failed to create ingredient");
    }
  }

  async updateIngredient(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.id);
      if (id == null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const body = updateIngredientSchema.parse(req.body);
      const ingredient = await this.service.updateIngredient(id, body);
      res.json(ingredient);
    } catch (err) {
      this.handleError(err, res, "Failed to update ingredient");
    }
  }

  async deleteIngredient(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.id);
      if (id == null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      await this.service.deleteIngredient(id);
      res.status(204).send();
    } catch (err) {
      this.handleError(err, res, "Failed to delete ingredient");
    }
  }

  // ---- Composition ----------------------------------------------------------

  async getItemIngredients(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.id);
      if (id == null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const rows = await this.service.getItemIngredients(id);
      res.json(rows);
    } catch (err) {
      this.handleError(err, res, "Failed to get item composition");
    }
  }

  async setItemIngredients(req: Request, res: Response): Promise<void> {
    try {
      const id = parseId(req.params.id);
      if (id == null) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const body = setCompositionSchema.parse(req.body);
      const rows = await this.service.setItemIngredients(id, body);
      res.json(rows);
    } catch (err) {
      this.handleError(err, res, "Failed to set item composition");
    }
  }

  private handleError(err: unknown, res: Response, logMessage: string): void {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "Invalid request body", issues: err.issues });
      return;
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error({ err }, logMessage);
    res.status(500).json({ error: logMessage });
  }
}

function parseId(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}
