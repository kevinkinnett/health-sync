import type {
  DoseResponseSummary,
  IngredientByDay,
  IntakeByDay,
  IntakeCorrelations,
  LagProfile,
  SupplementAdherence,
} from "@health-dashboard/shared";

/** Application capabilities exposed to HTTP and v1 API adapters. */
export interface AnalyticsUseCases {
  getSupplementAdherence(
    itemId: number,
    start: string,
    end: string,
  ): Promise<SupplementAdherence>;
  getSupplementIntakeByDay(
    start: string,
    end: string,
    itemId?: number,
  ): Promise<IntakeByDay[]>;
  getIngredientByDay(
    start: string,
    end: string,
    ingredientId?: number,
  ): Promise<IngredientByDay[]>;
  getSupplementCorrelations(
    itemId: number,
    lagDays: number,
  ): Promise<IntakeCorrelations>;
  getMedicationAdherence(
    itemId: number,
    start: string,
    end: string,
  ): Promise<SupplementAdherence>;
  getMedicationIntakeByDay(
    start: string,
    end: string,
    itemId?: number,
  ): Promise<IntakeByDay[]>;
  getMedicationCorrelations(
    itemId: number,
    lagDays: number,
  ): Promise<IntakeCorrelations>;
  getMedicationDoseResponse(itemId: number): Promise<DoseResponseSummary>;
  getMedicationLagProfile(itemId: number, maxLag?: number): Promise<LagProfile>;
}
