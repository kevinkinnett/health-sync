import type {
  SupplementItem,
  SupplementIntake,
  SupplementIngredient,
  SupplementItemIngredient,
  CreateSupplementItemBody,
  UpdateSupplementItemBody,
  CreateSupplementIntakeBody,
  CreateSupplementIngredientBody,
  UpdateSupplementIngredientBody,
  SetSupplementItemIngredientsBody,
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
 * Coordinates supplement repository access and centralizes:
 *  - default-fallback for intake amount/unit
 *  - composition-based ingredient breakdown when logging
 *  - find-or-create lookup for ingredient names submitted in composition
 */
export class SupplementService {
  constructor(private repo: SupplementRepository) {}

  // ---------------------------------------------------------------------------
  // Items
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Intakes
  // ---------------------------------------------------------------------------

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
   *
   * If the item has a composition, this also writes a snapshot
   * breakdown — scaled by `intake.amount / item.defaultAmount` when the
   * intake unit matches the item's default unit. If units differ, the
   * intake still logs but the breakdown is skipped (we don't try to
   * cross-convert units).
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
    const breakdown = computeBreakdown(item, amount, unit);

    return this.repo.createIntake({
      itemId: body.itemId,
      takenAt,
      amount,
      unit,
      notes: body.notes ?? null,
      breakdown,
    });
  }

  async deleteIntake(id: number): Promise<void> {
    const ok = await this.repo.deleteIntake(id);
    if (!ok) throw new NotFoundError(`Intake ${id} not found`);
  }

  // ---------------------------------------------------------------------------
  // Ingredient catalog
  // ---------------------------------------------------------------------------

  listIngredients(): Promise<SupplementIngredient[]> {
    return this.repo.listIngredients();
  }

  createIngredient(
    body: CreateSupplementIngredientBody,
  ): Promise<SupplementIngredient> {
    return this.repo.createIngredient(body);
  }

  async updateIngredient(
    id: number,
    body: UpdateSupplementIngredientBody,
  ): Promise<SupplementIngredient> {
    const updated = await this.repo.updateIngredient(id, body);
    if (!updated) throw new NotFoundError(`Ingredient ${id} not found`);
    return updated;
  }

  async deleteIngredient(id: number): Promise<void> {
    try {
      const ok = await this.repo.deleteIngredient(id);
      if (!ok) throw new NotFoundError(`Ingredient ${id} not found`);
    } catch (err) {
      // Foreign-key violation when the ingredient is in use somewhere.
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "23503"
      ) {
        throw new ValidationError(
          `Ingredient ${id} is referenced by a supplement composition or intake history and cannot be deleted`,
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Composition
  // ---------------------------------------------------------------------------

  /**
   * Replace-all set of an item's composition. Each entry may either:
   *  - reference an existing ingredient by `ingredientId`, or
   *  - supply an `ingredientName`, in which case we look up by
   *    case-insensitive name and create the ingredient if missing.
   *
   * Throws ValidationError if neither id nor name is provided, or if an
   * `ingredientId` doesn't resolve to an existing ingredient.
   * Throws NotFoundError if the parent item doesn't exist.
   */
  async setItemIngredients(
    itemId: number,
    body: SetSupplementItemIngredientsBody,
  ): Promise<SupplementItemIngredient[]> {
    const item = await this.repo.getItem(itemId);
    if (!item) throw new NotFoundError(`Item ${itemId} not found`);

    // Validate uniqueness of ingredients within the composition. After
    // find-or-create, duplicate names collapse to the same id, so a single
    // id-based set is enough.
    const seenIds = new Set<number>();

    const resolved: Array<{
      ingredientId: number;
      amount: number;
      unit: string;
      sortOrder: number;
    }> = [];
    for (let i = 0; i < body.ingredients.length; i++) {
      const entry = body.ingredients[i];
      let ingredientId: number;

      if (entry.ingredientId != null) {
        const existing = await this.repo.getIngredient(entry.ingredientId);
        if (!existing) {
          throw new ValidationError(
            `Ingredient ${entry.ingredientId} not found`,
          );
        }
        ingredientId = existing.id;
      } else if (entry.ingredientName != null && entry.ingredientName.trim()) {
        const name = entry.ingredientName.trim();
        const existing = await this.repo.findIngredientByName(name);
        if (existing) {
          ingredientId = existing.id;
        } else {
          const created = await this.repo.createIngredient({ name });
          ingredientId = created.id;
        }
      } else {
        throw new ValidationError(
          `Composition row ${i} requires either ingredientId or ingredientName`,
        );
      }

      if (seenIds.has(ingredientId)) {
        throw new ValidationError(
          `Ingredient appears multiple times in composition`,
        );
      }
      seenIds.add(ingredientId);

      resolved.push({
        ingredientId,
        amount: entry.amount,
        unit: entry.unit,
        sortOrder: entry.sortOrder ?? i,
      });
    }

    return this.repo.setItemIngredients(itemId, resolved);
  }

  getItemIngredients(itemId: number): Promise<SupplementItemIngredient[]> {
    return this.repo.getItemIngredients(itemId);
  }
}

/**
 * Computes the per-intake ingredient snapshot. Scales by the intake
 * amount when the intake unit matches the item's default unit and the
 * item has a positive default amount. Otherwise returns an empty
 * breakdown (we don't try to cross-unit convert).
 *
 * Exported for unit testing.
 */
export function computeBreakdown(
  item: SupplementItem,
  intakeAmount: number,
  intakeUnit: string,
): Array<{
  ingredientId: number;
  ingredientName: string;
  amount: number;
  unit: string;
}> {
  if (item.ingredients.length === 0) return [];
  if (item.defaultAmount == null || item.defaultAmount <= 0) return [];
  if (intakeUnit !== item.defaultUnit) return [];

  const ratio = intakeAmount / item.defaultAmount;
  return item.ingredients.map((row) => ({
    ingredientId: row.ingredientId,
    ingredientName: row.ingredientName,
    amount: roundTo3(row.amount * ratio),
    unit: row.unit,
  }));
}

function roundTo3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
