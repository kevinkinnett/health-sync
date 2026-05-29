import type { Request, Response } from "express";
import { z } from "zod";
import type { SupplementService } from "../services/supplementService.js";
import { parseId } from "./_params.js";

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
    const includeInactive = req.query.includeInactive === "true";
    res.json(await this.service.listItems(includeInactive));
  }

  async getItem(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    res.json(await this.service.getItem(id));
  }

  async createItem(req: Request, res: Response): Promise<void> {
    const body = createItemSchema.parse(req.body);
    res.status(201).json(await this.service.createItem(body));
  }

  async updateItem(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    const body = updateItemSchema.parse(req.body);
    res.json(await this.service.updateItem(id, body));
  }

  async archiveItem(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    await this.service.archiveItem(id);
    res.status(204).send();
  }

  // ---- Intakes --------------------------------------------------------------

  async listIntakes(req: Request, res: Response): Promise<void> {
    const start = typeof req.query.start === "string" ? req.query.start : undefined;
    const end = typeof req.query.end === "string" ? req.query.end : undefined;
    const itemId =
      typeof req.query.itemId === "string"
        ? parseId(req.query.itemId, "itemId")
        : undefined;
    res.json(await this.service.listIntakes(start, end, itemId));
  }

  async createIntake(req: Request, res: Response): Promise<void> {
    const body = createIntakeSchema.parse(req.body);
    res.status(201).json(await this.service.logIntake(body));
  }

  async deleteIntake(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    await this.service.deleteIntake(id);
    res.status(204).send();
  }

  // ---- Ingredients ----------------------------------------------------------

  async listIngredients(_req: Request, res: Response): Promise<void> {
    res.json(await this.service.listIngredients());
  }

  async createIngredient(req: Request, res: Response): Promise<void> {
    const body = createIngredientSchema.parse(req.body);
    res.status(201).json(await this.service.createIngredient(body));
  }

  async updateIngredient(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    const body = updateIngredientSchema.parse(req.body);
    res.json(await this.service.updateIngredient(id, body));
  }

  async deleteIngredient(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    await this.service.deleteIngredient(id);
    res.status(204).send();
  }

  // ---- Composition ----------------------------------------------------------

  async getItemIngredients(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    res.json(await this.service.getItemIngredients(id));
  }

  async setItemIngredients(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    const body = setCompositionSchema.parse(req.body);
    res.json(await this.service.setItemIngredients(id, body));
  }
}
