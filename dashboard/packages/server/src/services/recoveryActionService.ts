import type {
  ConfirmRecoveryPendingActionBody,
  PrepareRecoverySessionActionBody,
  RecoveryPendingAction,
  RecoverySession,
} from "@health-dashboard/shared";
import type { RecoveryRepository } from "../repositories/recoveryRepo.js";
import type { RecoveryService } from "./recoveryService.js";
import { LocalDateTimeError, localDateTimeToUtc } from "./userTz.js";
import { NotFoundError, ValidationError } from "./errors.js";

export class RecoveryActionService {
  constructor(
    private readonly repo: RecoveryRepository,
    private readonly recovery: RecoveryService,
    private readonly timezone: string,
  ) {}

  async prepare(
    conversationId: string,
    body: PrepareRecoverySessionActionBody,
  ): Promise<RecoveryPendingAction> {
    const activity = await this.repo.findActivity(body.activity);
    if (!activity) throw new NotFoundError(`Recovery activity '${body.activity}' not found`);
    let startedAt: string;
    try {
      startedAt = localDateTimeToUtc(body.startedLocal, this.timezone);
    } catch (error) {
      if (error instanceof LocalDateTimeError) throw new ValidationError(error.message);
      throw error;
    }
    const proposal = await this.recovery.normalizeProposal({
      activityId: activity.id,
      startedAt,
      durationMinutes: body.durationMinutes,
      intensity: body.intensity,
      temperatureF: body.temperatureF,
      massageType: body.massageType,
      notes: body.notes,
    });
    return this.repo.createPendingAction({
      conversationId,
      proposal,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  listConversationActions(conversationId: string): Promise<RecoveryPendingAction[]> {
    return this.repo.listPendingActions(conversationId);
  }

  async cancel(id: string): Promise<RecoveryPendingAction> {
    const action = await this.repo.cancelPendingAction(id);
    if (!action) throw new NotFoundError(`Pending recovery action ${id} not found`);
    return action;
  }

  async confirm(
    id: string,
    overrides: ConfirmRecoveryPendingActionBody,
  ): Promise<{ action: RecoveryPendingAction; session: RecoverySession }> {
    const current = await this.repo.getPendingAction(id);
    if (!current) throw new NotFoundError(`Pending recovery action ${id} not found`);
    if (current.status === "cancelled") throw new ValidationError("This recovery action was cancelled");
    if (current.status === "expired" || Date.parse(current.expiresAt) <= Date.now())
      throw new ValidationError("This recovery action has expired");
    const proposal = await this.recovery.normalizeProposal({
      activityId: current.proposal.activityId,
      startedAt: overrides.startedAt ?? current.proposal.startedAt,
      durationMinutes: overrides.durationMinutes ?? current.proposal.durationMinutes,
      intensity: overrides.intensity === undefined ? current.proposal.intensity : overrides.intensity,
      temperatureF: overrides.temperatureF === undefined ? current.proposal.temperatureF : overrides.temperatureF,
      massageType: overrides.massageType === undefined ? current.proposal.massageType : overrides.massageType,
      notes: overrides.notes === undefined ? current.proposal.notes : overrides.notes,
    });
    const result = await this.repo.confirmPendingAction(id, proposal, overrides);
    if (!result) throw new NotFoundError(`Pending recovery action ${id} not found`);
    if (!result.session) throw new ValidationError(`This recovery action is ${result.action.status}`);
    return { action: result.action, session: result.session };
  }
}
