import type {
  ActivityDay,
  HeartRateDay,
  HrvDay,
  IngredientByDay,
  SleepDay,
} from "@health-dashboard/shared";

export interface IntakeItemSummary {
  name: string;
}

export interface IntakeRow {
  itemId: number;
  itemName: string;
  takenAt: string;
  amount: number;
  unit: string;
}

/** Smallest read capability shared by supplement and medication analysis. */
export interface IntakeHistoryPort {
  getItem(id: number): Promise<IntakeItemSummary | null>;
  listIntakes(
    start?: string,
    end?: string,
    itemId?: number,
  ): Promise<IntakeRow[]>;
}

/**
 * Read-only capabilities required by the analytics application layer.
 *
 * Keeping these ports deliberately narrow prevents the analytical layer from
 * depending on repository lifecycle, schema creation, or write operations.
 * The PostgreSQL repositories satisfy them structurally, while unit tests can
 * provide small in-memory implementations.
 */
export interface SupplementAnalyticsPort extends IntakeHistoryPort {
  listIngredientByDay(
    start: string,
    end: string,
    userTimezone: string,
    ingredientId?: number,
  ): Promise<IngredientByDay[]>;
}

export type MedicationAnalyticsPort = IntakeHistoryPort;

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
