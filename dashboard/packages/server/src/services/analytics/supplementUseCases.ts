import type {
  IngredientByDay,
  IntakeByDay,
  IntakeCorrelations,
  SupplementAdherence,
} from "@health-dashboard/shared";
import type { SupplementAnalyticsPort } from "./ports.js";
import type { IntakeUseCases } from "./intakeUseCases.js";
import { tzDayEndUtc, tzDayStartUtc } from "../userTz.js";

/** Supplement-specific application use cases. */
export class SupplementAnalyticsUseCases {
  constructor(
    private readonly repo: SupplementAnalyticsPort,
    private readonly intakes: IntakeUseCases,
    private readonly tz: string,
  ) {}

  getAdherence(itemId: number, start: string, end: string): Promise<SupplementAdherence> {
    return this.intakes.getAdherence(itemId, start, end);
  }

  getIntakeByDay(start: string, end: string, itemId?: number): Promise<IntakeByDay[]> {
    return this.intakes.getIntakeByDay(start, end, itemId);
  }

  getCorrelations(itemId: number, lagDays: number): Promise<IntakeCorrelations> {
    return this.intakes.getCorrelations(itemId, lagDays);
  }

  getIngredientByDay(
    start: string,
    end: string,
    ingredientId?: number,
  ): Promise<IngredientByDay[]> {
    return this.repo.listIngredientByDay(
      tzDayStartUtc(start, this.tz),
      tzDayEndUtc(end, this.tz),
      this.tz,
      ingredientId,
    );
  }
}
