import type {
  DoseResponseSummary,
  IngredientByDay,
  IntakeByDay,
  IntakeCorrelations,
  LagProfile,
  SupplementAdherence,
} from "@health-dashboard/shared";
import type {
  ActivitySeriesPort,
  HeartRateSeriesPort,
  HrvSeriesPort,
  MedicationAnalyticsPort,
  SleepSeriesPort,
  SupplementAnalyticsPort,
} from "./analytics/ports.js";
import { DailyMetricAnalysis } from "./analytics/metricAnalysis.js";
import { IntakeUseCases } from "./analytics/intakeUseCases.js";
import { SupplementAnalyticsUseCases } from "./analytics/supplementUseCases.js";
import { MedicationAnalyticsUseCases } from "./analytics/medicationUseCases.js";
import type { AnalyticsUseCases } from "./analytics/contracts.js";

export { AnalyticsNotFoundError } from "./analytics/errors.js";

/**
 * Stable analytics facade used by HTTP controllers and the v1 tool API.
 *
 * The facade preserves the deployed contract while focused collaborators own
 * intake calendar rules, metric-series joins, supplement queries, and
 * medication dose/lag analysis. Concrete wiring remains at the composition
 * boundary through the narrow capability ports accepted by the constructor.
 */
export class AnalyticsService implements AnalyticsUseCases {
  private readonly supplements: SupplementAnalyticsUseCases;
  private readonly medications: MedicationAnalyticsUseCases;

  constructor(
    supplementRepo: SupplementAnalyticsPort,
    medicationRepo: MedicationAnalyticsPort,
    activityRepo: ActivitySeriesPort,
    sleepRepo: SleepSeriesPort,
    heartRateRepo: HeartRateSeriesPort,
    hrvRepo: HrvSeriesPort,
    opts: { userTimezone: string } = { userTimezone: "UTC" },
  ) {
    const metrics = new DailyMetricAnalysis(
      activityRepo,
      sleepRepo,
      heartRateRepo,
      hrvRepo,
    );
    const supplementIntakes = new IntakeUseCases(
      supplementRepo,
      metrics,
      "Supplement",
      opts.userTimezone,
    );
    const medicationIntakes = new IntakeUseCases(
      medicationRepo,
      metrics,
      "Medication",
      opts.userTimezone,
    );
    this.supplements = new SupplementAnalyticsUseCases(
      supplementRepo,
      supplementIntakes,
      opts.userTimezone,
    );
    this.medications = new MedicationAnalyticsUseCases(medicationIntakes, metrics);
  }

  getSupplementAdherence(
    itemId: number,
    start: string,
    end: string,
  ): Promise<SupplementAdherence> {
    return this.supplements.getAdherence(itemId, start, end);
  }

  getSupplementIntakeByDay(
    start: string,
    end: string,
    itemId?: number,
  ): Promise<IntakeByDay[]> {
    return this.supplements.getIntakeByDay(start, end, itemId);
  }

  getIngredientByDay(
    start: string,
    end: string,
    ingredientId?: number,
  ): Promise<IngredientByDay[]> {
    return this.supplements.getIngredientByDay(start, end, ingredientId);
  }

  getSupplementCorrelations(
    itemId: number,
    lagDays: number,
  ): Promise<IntakeCorrelations> {
    return this.supplements.getCorrelations(itemId, lagDays);
  }

  getMedicationAdherence(
    itemId: number,
    start: string,
    end: string,
  ): Promise<SupplementAdherence> {
    return this.medications.getAdherence(itemId, start, end);
  }

  getMedicationIntakeByDay(
    start: string,
    end: string,
    itemId?: number,
  ): Promise<IntakeByDay[]> {
    return this.medications.getIntakeByDay(start, end, itemId);
  }

  getMedicationCorrelations(
    itemId: number,
    lagDays: number,
  ): Promise<IntakeCorrelations> {
    return this.medications.getCorrelations(itemId, lagDays);
  }

  getMedicationDoseResponse(itemId: number): Promise<DoseResponseSummary> {
    return this.medications.getDoseResponse(itemId);
  }

  getMedicationLagProfile(itemId: number, maxLag = 7): Promise<LagProfile> {
    return this.medications.getLagProfile(itemId, maxLag);
  }
}
