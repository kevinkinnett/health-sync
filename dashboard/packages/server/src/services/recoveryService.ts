import type {
  CreateRecoveryActivityBody,
  CreateRecoverySessionBody,
  RecoveryActivity,
  RecoverySession,
  RecoverySessionProposal,
  RecoverySessionSource,
  UpdateRecoveryActivityBody,
  UpdateRecoverySessionBody,
} from "@health-dashboard/shared";
import type { RecoveryRepository } from "../repositories/recoveryRepo.js";
import { NotFoundError, ValidationError } from "./errors.js";

export class RecoveryService {
  constructor(
    private readonly repo: RecoveryRepository,
    private readonly timezone: string,
  ) {}

  listActivities(includeInactive = false): Promise<RecoveryActivity[]> {
    return this.repo.listActivities(includeInactive);
  }

  async getActivity(id: number): Promise<RecoveryActivity> {
    const activity = await this.repo.getActivity(id);
    if (!activity) throw new NotFoundError(`Recovery activity ${id} not found`);
    return activity;
  }

  createActivity(body: CreateRecoveryActivityBody): Promise<RecoveryActivity> {
    this.validateActivity(body);
    return this.repo.createActivity({ ...body, code: body.code.trim().toLowerCase() });
  }

  async updateActivity(id: number, body: UpdateRecoveryActivityBody): Promise<RecoveryActivity> {
    if (body.name !== undefined && !body.name.trim())
      throw new ValidationError("Activity name is required");
    if (body.defaultDurationMinutes != null && body.defaultDurationMinutes <= 0)
      throw new ValidationError("Default duration must be greater than zero");
    const activity = await this.repo.updateActivity(id, body);
    if (!activity) throw new NotFoundError(`Recovery activity ${id} not found`);
    return activity;
  }

  async archiveActivity(id: number): Promise<void> {
    const activity = await this.repo.archiveActivity(id);
    if (!activity) throw new NotFoundError(`Recovery activity ${id} not found`);
  }

  listSessions(start?: string, end?: string, activityId?: number): Promise<RecoverySession[]> {
    if (start && end && start > end) throw new ValidationError("Start date must not follow end date");
    return this.repo.listSessions(start, end, activityId, this.timezone);
  }

  async logSession(
    body: CreateRecoverySessionBody,
    source: RecoverySessionSource = "manual",
  ): Promise<RecoverySession> {
    const proposal = await this.normalizeProposal(body);
    return this.repo.createSession(proposal, source);
  }

  async updateSession(id: number, body: UpdateRecoverySessionBody): Promise<RecoverySession> {
    const current = await this.repo.getSession(id);
    if (!current) throw new NotFoundError(`Recovery session ${id} not found`);
    const activityId = body.activityId ?? current.activityId;
    const proposal = await this.normalizeProposal({
      activityId,
      startedAt: body.startedAt ?? current.startedAt,
      durationMinutes: body.durationMinutes ?? current.durationMinutes,
      intensity: body.intensity === undefined ? current.intensity : body.intensity,
      temperatureF: body.temperatureF === undefined ? current.temperatureF : body.temperatureF,
      massageType: body.massageType === undefined ? current.massageType : body.massageType,
      notes: body.notes === undefined ? current.notes : body.notes,
    });
    const updated = await this.repo.updateSession(id, proposal);
    if (!updated) throw new NotFoundError(`Recovery session ${id} not found`);
    return updated;
  }

  async deleteSession(id: number): Promise<void> {
    if (!(await this.repo.deleteSession(id)))
      throw new NotFoundError(`Recovery session ${id} not found`);
  }

  async normalizeProposal(body: CreateRecoverySessionBody): Promise<RecoverySessionProposal> {
    const activity = await this.getActivity(body.activityId);
    if (!activity.isActive) throw new ValidationError(`${activity.name} is archived`);
    const durationMinutes = body.durationMinutes ?? activity.defaultDurationMinutes;
    if (durationMinutes == null)
      throw new ValidationError(`${activity.name} has no default duration; duration is required`);
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0)
      throw new ValidationError("Duration must be a positive whole number of minutes");
    if (body.intensity != null && (!Number.isInteger(body.intensity) || body.intensity < 1 || body.intensity > 5))
      throw new ValidationError("Intensity must be between 1 and 5");
    if (body.temperatureF != null && (!Number.isFinite(body.temperatureF) || body.temperatureF <= 0))
      throw new ValidationError("Temperature must be greater than zero");
    if (activity.category !== "heat_therapy" && body.temperatureF != null)
      throw new ValidationError("Temperature is only valid for heat therapy");
    if (activity.category !== "massage" && body.massageType?.trim())
      throw new ValidationError("Massage type is only valid for massage activities");
    const startedAt = body.startedAt ?? new Date().toISOString();
    if (!Number.isFinite(Date.parse(startedAt))) throw new ValidationError("Start time is invalid");
    return {
      activityId: activity.id,
      activityCode: activity.code,
      activityName: activity.name,
      activityCategory: activity.category,
      startedAt: new Date(startedAt).toISOString(),
      durationMinutes,
      intensity: body.intensity ?? null,
      temperatureF: body.temperatureF ?? null,
      massageType: body.massageType?.trim() || null,
      notes: body.notes?.trim() || null,
    };
  }

  private validateActivity(body: CreateRecoveryActivityBody): void {
    if (!/^[a-z][a-z0-9_]*$/.test(body.code.trim().toLowerCase()))
      throw new ValidationError("Activity code must use lowercase letters, numbers, and underscores");
    if (!body.name.trim()) throw new ValidationError("Activity name is required");
    if (body.defaultDurationMinutes != null && body.defaultDurationMinutes <= 0)
      throw new ValidationError("Default duration must be greater than zero");
  }
}
