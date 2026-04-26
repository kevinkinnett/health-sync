import type {
  SupplementItem,
  SupplementIntake,
  CreateSupplementItemBody,
  UpdateSupplementItemBody,
  CreateSupplementIntakeBody,
} from "@health-dashboard/shared";
import type { SupplementRepository } from "../repositories/supplementRepo.js";

/** Thrown when a referenced item doesn't exist or is inactive. */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Thrown when business rules reject a request (vs. malformed input). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Coordinates supplement repository access and centralizes the
 * default-fallback logic for intake creation.
 */
export class SupplementService {
  constructor(private repo: SupplementRepository) {}

  listItems(includeInactive: boolean): Promise<SupplementItem[]> {
    return this.repo.listItems(includeInactive);
  }

  async getItem(id: number): Promise<SupplementItem> {
    const item = await this.repo.getItem(id);
    if (!item) throw new NotFoundError(`Item ${id} not found`);
    return item;
  }

  createItem(body: CreateSupplementItemBody): Promise<SupplementItem> {
    return this.repo.createItem(body);
  }

  async updateItem(
    id: number,
    body: UpdateSupplementItemBody,
  ): Promise<SupplementItem> {
    const updated = await this.repo.updateItem(id, body);
    if (!updated) throw new NotFoundError(`Item ${id} not found`);
    return updated;
  }

  async archiveItem(id: number): Promise<void> {
    const ok = await this.repo.archiveItem(id);
    if (!ok) throw new NotFoundError(`Item ${id} not found`);
  }

  listIntakes(
    start?: string,
    end?: string,
    itemId?: number,
  ): Promise<SupplementIntake[]> {
    return this.repo.listIntakes(start, end, itemId);
  }

  /**
   * Logs an intake. If the body omits `amount` or `unit`, the item's
   * default values are substituted. The item must exist and be active.
   * `takenAt` defaults to "now" (server time, ISO).
   */
  async logIntake(body: CreateSupplementIntakeBody): Promise<SupplementIntake> {
    const item = await this.repo.getItem(body.itemId);
    if (!item) {
      throw new NotFoundError(`Item ${body.itemId} not found`);
    }
    if (!item.isActive) {
      throw new ValidationError(
        `Item ${body.itemId} (${item.name}) is archived and cannot accept new intakes`,
      );
    }

    const amount = body.amount ?? item.defaultAmount;
    if (amount == null) {
      throw new ValidationError(
        `Item ${item.name} has no default amount; an explicit amount is required`,
      );
    }

    const unit = body.unit ?? item.defaultUnit;
    const takenAt = body.takenAt ?? new Date().toISOString();

    return this.repo.createIntake({
      itemId: body.itemId,
      takenAt,
      amount,
      unit,
      notes: body.notes ?? null,
    });
  }

  async deleteIntake(id: number): Promise<void> {
    const ok = await this.repo.deleteIntake(id);
    if (!ok) throw new NotFoundError(`Intake ${id} not found`);
  }
}
