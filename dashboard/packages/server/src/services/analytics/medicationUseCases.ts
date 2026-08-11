import type {
  DoseResponseSummary,
  IntakeByDay,
  IntakeCorrelations,
  LagProfile,
  SupplementAdherence,
} from "@health-dashboard/shared";
import type { IntakeUseCases } from "./intakeUseCases.js";
import { shiftIntakeDays } from "./intakeAnalysis.js";
import { joinPearson, type DailyMetricAnalysis } from "./metricAnalysis.js";
import { addDays } from "../userTz.js";

/** Medication-specific intake, dose-level, and lag-profile use cases. */
export class MedicationAnalyticsUseCases {
  constructor(
    private readonly intakes: IntakeUseCases,
    private readonly metrics: DailyMetricAnalysis,
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

  async getDoseResponse(itemId: number): Promise<DoseResponseSummary> {
    const history = await this.intakes.getDenseDoseHistory(itemId);
    if (history.days.size === 0) {
      return {
        itemId,
        itemName: history.itemName,
        xLabel: history.xLabel,
        levels: [],
        metrics: [],
      };
    }

    const datesByDose = new Map<number, string[]>();
    for (const [date, dose] of history.days) {
      const dates = datesByDose.get(dose);
      if (dates) dates.push(date);
      else datesByDose.set(dose, [date]);
    }
    const levels = [...datesByDose.entries()]
      .map(([dose, dates]) => {
        dates.sort();
        return {
          dose,
          days: dates.length,
          firstDay: dates[0],
          lastDay: dates[dates.length - 1],
        };
      })
      .sort((a, b) => a.dose - b.dose);

    const dates = [...history.days.keys()].sort();
    const series = await this.metrics.load(dates[0], dates[dates.length - 1]);
    const metrics = series.map((metric) => {
      const valuesByDose = new Map<number, number[]>();
      for (const [date, dose] of history.days) {
        const value = metric.values.get(date);
        if (value == null) continue;
        const values = valuesByDose.get(dose);
        if (values) values.push(value);
        else valuesByDose.set(dose, [value]);
      }
      return {
        metric: metric.metric,
        metricLabel: metric.label,
        byLevel: [...valuesByDose.entries()]
          .map(([dose, values]) => ({
            dose,
            n: values.length,
            mean: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
            values: values.map((value) => Math.round(value * 10) / 10),
          }))
          .sort((a, b) => a.dose - b.dose),
      };
    });

    return {
      itemId,
      itemName: history.itemName,
      xLabel: history.xLabel,
      levels,
      metrics,
    };
  }

  async getLagProfile(itemId: number, maxLag = 7): Promise<LagProfile> {
    const history = await this.intakes.getDenseDoseHistory(itemId);
    if (history.days.size === 0) {
      return { itemId, itemName: history.itemName, maxLag, metrics: [] };
    }

    const dates = [...history.days.keys()].sort();
    const series = await this.metrics.load(
      dates[0],
      addDays(dates[dates.length - 1], maxLag),
    );
    return {
      itemId,
      itemName: history.itemName,
      maxLag,
      metrics: series.map((metric) => ({
        metric: metric.metric,
        metricLabel: metric.label,
        points: Array.from({ length: maxLag + 1 }, (_, lag) => {
          const shifted = shiftIntakeDays(history.days, lag);
          const { r, n } = joinPearson(shifted, metric.values);
          return { lag, r, n };
        }),
      })),
    };
  }
}
