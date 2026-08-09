import type {
  ActivityDay,
  HeartRateDay,
  HrvDay,
  IngredientByDay,
  MedicationIntake,
  MedicationItem,
  SleepDay,
  SupplementIntake,
  SupplementItem,
} from "@health-dashboard/shared";

/**
 * Read-only capabilities required by AnalyticsService.
 *
 * Keeping these ports deliberately narrow prevents the analytical layer from
 * depending on repository lifecycle, schema creation, or write operations.
 * The PostgreSQL repositories satisfy them structurally, while unit tests can
 * provide small in-memory implementations.
 */
export interface SupplementAnalyticsPort {
  getItem(id: number): Promise<SupplementItem | null>;
  listIntakes(
    start?: string,
    end?: string,
    itemId?: number,
  ): Promise<SupplementIntake[]>;
  listIngredientByDay(
    start: string,
    end: string,
    userTimezone: string,
    ingredientId?: number,
  ): Promise<IngredientByDay[]>;
}

export interface MedicationAnalyticsPort {
  getItem(id: number): Promise<MedicationItem | null>;
  listIntakes(
    start?: string,
    end?: string,
    itemId?: number,
  ): Promise<MedicationIntake[]>;
}

export interface ActivitySeriesPort {
  findByDateRange(start: string, end: string): Promise<ActivityDay[]>;
}

export interface SleepSeriesPort {
  findByDateRange(start: string, end: string): Promise<SleepDay[]>;
}

export interface HeartRateSeriesPort {
  findByDateRange(start: string, end: string): Promise<HeartRateDay[]>;
}

export interface HrvSeriesPort {
  findByDateRange(start: string, end: string): Promise<HrvDay[]>;
}
