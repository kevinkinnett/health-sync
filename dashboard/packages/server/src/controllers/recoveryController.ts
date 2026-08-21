import type { Request, Response } from "express";
import { z } from "zod";
import type { RecoveryService } from "../services/recoveryService.js";
import type { RecoveryActionService } from "../services/recoveryActionService.js";
import type { RecoveryEffectsService } from "../services/recoveryEffectsService.js";
import { todayInTz } from "../services/userTz.js";
import { parseId } from "./_params.js";

const category = z.enum(["heat_therapy", "massage", "other"]);
const activityCreate = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(1),
  category,
  defaultDurationMinutes: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
}).strict();
const activityUpdate = z.object({
  name: z.string().trim().min(1).optional(),
  defaultDurationMinutes: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, "at least one field is required");
const sessionFields = {
  startedAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().positive().optional(),
  intensity: z.number().int().min(1).max(5).nullable().optional(),
  temperatureF: z.number().positive().nullable().optional(),
  massageType: z.string().trim().nullable().optional(),
  notes: z.string().nullable().optional(),
};
const sessionCreate = z.object({ activityId: z.number().int().positive(), ...sessionFields }).strict();
const sessionUpdate = z.object({ activityId: z.number().int().positive().optional(), ...sessionFields })
  .strict().refine((body) => Object.keys(body).length > 0, "at least one field is required");

const confirmAction = z.object({
  startedAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().positive().optional(),
  intensity: z.number().int().min(1).max(5).nullable().optional(),
  temperatureF: z.number().positive().nullable().optional(),
  massageType: z.string().trim().nullable().optional(),
  notes: z.string().nullable().optional(),
}).strict();

export class RecoveryController {
  constructor(
    private readonly service: RecoveryService,
    private readonly actions?: RecoveryActionService,
    private readonly effects?: RecoveryEffectsService,
    private readonly timezone = "America/New_York",
  ) {}

  async listActivities(req: Request, res: Response): Promise<void> {
    res.json(await this.service.listActivities(req.query.includeInactive === "true"));
  }
  async getActivity(req: Request, res: Response): Promise<void> {
    res.json(await this.service.getActivity(parseId(req.params.id)));
  }
  async createActivity(req: Request, res: Response): Promise<void> {
    res.status(201).json(await this.service.createActivity(activityCreate.parse(req.body)));
  }
  async updateActivity(req: Request, res: Response): Promise<void> {
    res.json(await this.service.updateActivity(parseId(req.params.id), activityUpdate.parse(req.body)));
  }
  async archiveActivity(req: Request, res: Response): Promise<void> {
    await this.service.archiveActivity(parseId(req.params.id));
    res.status(204).send();
  }
  async listSessions(req: Request, res: Response): Promise<void> {
    const start = typeof req.query.start === "string" ? req.query.start : undefined;
    const end = typeof req.query.end === "string" ? req.query.end : undefined;
    const activityId = typeof req.query.activityId === "string" ? parseId(req.query.activityId, "activityId") : undefined;
    res.json(await this.service.listSessions(start, end, activityId));
  }
  async createSession(req: Request, res: Response): Promise<void> {
    res.status(201).json(await this.service.logSession(sessionCreate.parse(req.body)));
  }
  async updateSession(req: Request, res: Response): Promise<void> {
    res.json(await this.service.updateSession(parseId(req.params.id), sessionUpdate.parse(req.body)));
  }
  async deleteSession(req: Request, res: Response): Promise<void> {
    await this.service.deleteSession(parseId(req.params.id));
    res.status(204).send();
  }
  async getEffects(_req: Request, res: Response): Promise<void> {
    if (!this.effects) throw new Error("Recovery effects service is unavailable");
    res.json(await this.effects.get(todayInTz(this.timezone)));
  }
  async confirmPendingAction(req: Request, res: Response): Promise<void> {
    if (!this.actions) throw new Error("Recovery action service is unavailable");
    res.json(await this.actions.confirm(String(req.params.id), confirmAction.parse(req.body ?? {})));
  }
  async cancelPendingAction(req: Request, res: Response): Promise<void> {
    if (!this.actions) throw new Error("Recovery action service is unavailable");
    res.json(await this.actions.cancel(String(req.params.id)));
  }
}
