import type { Request, Response } from "express";
import { z } from "zod";
import type { MedicationService } from "../services/medicationService.js";
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

const updateIntakeSchema = z
  .object({
    takenAt: z.string().datetime({ offset: true }).optional(),
    amount: z.number().nonnegative().optional(),
    unit: z.string().trim().min(1).optional(),
    notes: z.string().nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "at least one field is required",
  });

export class MedicationController {
  constructor(private service: MedicationService) {}

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

  async updateIntake(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    const body = updateIntakeSchema.parse(req.body);
    res.json(await this.service.updateIntake(id, body));
  }

  async deleteIntake(req: Request, res: Response): Promise<void> {
    const id = parseId(req.params.id);
    await this.service.deleteIntake(id);
    res.status(204).send();
  }
}
