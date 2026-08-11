import type { IntakeByDay, IntakeCorrelations, SupplementAdherence } from "@health-dashboard/shared";
import type { IntakeHistoryPort } from "./ports.js";
import { AnalyticsNotFoundError } from "./errors.js";
import {
  buildAdherence,
  doseSeriesByDay,
  fillSkippedDays,
  rollupIntakeByDay,
  shiftIntakeDays,
} from "./intakeAnalysis.js";
import type { DailyMetricAnalysis } from "./metricAnalysis.js";
import { addDays, formatDateInTz, tzDayEndUtc, tzDayStartUtc } from "../userTz.js";

export interface DenseDoseHistory {
  itemName: string;
  xLabel: string;
  days: Map<string, number>;
}

/** Common supplement/medication intake use cases over a narrow history port. */
export class IntakeUseCases {
  constructor(
    private readonly repo: IntakeHistoryPort,
    private readonly metrics: DailyMetricAnalysis,
    private readonly entityLabel: "Supplement" | "Medication",
    private readonly tz: string,
  ) {}

  async getAdherence(
    itemId: number,
    start: string,
    end: string,
  ): Promise<SupplementAdherence> {
    const item = await this.requireItem(itemId);
    const intakes = await this.repo.listIntakes(
      tzDayStartUtc(start, this.tz),
      tzDayEndUtc(end, this.tz),
      itemId,
    );
    return buildAdherence(itemId, item.name, start, end, intakes, this.tz);
  }

  async getIntakeByDay(
    start: string,
    end: string,
    itemId?: number,
  ): Promise<IntakeByDay[]> {
    const intakes = await this.repo.listIntakes(
      tzDayStartUtc(start, this.tz),
      tzDayEndUtc(end, this.tz),
      itemId,
    );
    return rollupIntakeByDay(intakes, this.tz);
  }

  async getCorrelations(itemId: number, lagDays: number): Promise<IntakeCorrelations> {
    const history = await this.getDenseDoseHistory(itemId);
    const shifted = shiftIntakeDays(history.days, lagDays);
    return {
      itemId,
      itemName: history.itemName,
      lagDays,
      pairs: await this.metrics.correlate(shifted, history.itemName, history.xLabel),
    };
  }

  async getDenseDoseHistory(itemId: number): Promise<DenseDoseHistory> {
    const item = await this.requireItem(itemId);
    const intakes = await this.repo.listIntakes(undefined, undefined, itemId);
    const { days, xLabel } = doseSeriesByDay(intakes, this.tz);
    return {
      itemName: item.name,
      xLabel,
      days: fillSkippedDays(days, this.lastCompleteDay()),
    };
  }

  private async requireItem(itemId: number) {
    const item = await this.repo.getItem(itemId);
    if (!item) {
      throw new AnalyticsNotFoundError(`${this.entityLabel} item ${itemId} not found`);
    }
    return item;
  }

  private lastCompleteDay(): string {
    return addDays(formatDateInTz(new Date().toISOString(), this.tz), -1);
  }
}
