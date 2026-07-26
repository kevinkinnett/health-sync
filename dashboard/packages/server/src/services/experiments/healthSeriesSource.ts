import type { HealthDataService } from "../healthDataService.js";
import type { DailyPoint, DailySeriesSource } from "./metricRegistry.js";

/**
 * Adapts the health repositories to the engine's {@link DailySeriesSource}
 * port.
 *
 * All the knowledge of "which table holds this metric and what is the
 * field called" lives here, so the engine stays free of storage detail and
 * the extractors stay in one greppable table.
 */

type Family = "sleep" | "heartRate" | "hrv" | "activity";

interface Extractor {
  family: Family;
  pick: (row: Record<string, unknown>) => number | null;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const EXTRACTORS: Record<string, Extractor> = {
  sleepMin: { family: "sleep", pick: (r) => num(r.totalMinutesAsleep) },
  inBedMin: { family: "sleep", pick: (r) => num(r.totalMinutesInBed) },
  efficiency: { family: "sleep", pick: (r) => num(r.efficiency) },
  wakeMin: { family: "sleep", pick: (r) => num(r.minutesWake) },
  deepMin: { family: "sleep", pick: (r) => num(r.minutesDeep) },
  remMin: { family: "sleep", pick: (r) => num(r.minutesRem) },
  restingHr: { family: "heartRate", pick: (r) => num(r.restingHeartRate) },
  dailyRmssd: { family: "hrv", pick: (r) => num(r.dailyRmssd) },
  steps: { family: "activity", pick: (r) => num(r.steps) },
  activeMinutes: {
    family: "activity",
    pick: (r) =>
      (num(r.minutesFairlyActive) ?? 0) + (num(r.minutesVeryActive) ?? 0),
  },
};

export class HealthSeriesSource implements DailySeriesSource {
  constructor(private readonly health: HealthDataService) {}

  async fetch(metric: string, start: string, end: string): Promise<DailyPoint[]> {
    const extractor = EXTRACTORS[metric];
    if (!extractor) return [];

    const rows = await this.rowsFor(extractor.family, start, end);
    const points: DailyPoint[] = [];
    for (const row of rows) {
      const value = extractor.pick(row as Record<string, unknown>);
      const date = (row as { date?: unknown }).date;
      if (value != null && typeof date === "string") {
        points.push({ date, value });
      }
    }
    return points;
  }

  private async rowsFor(
    family: Family,
    start: string,
    end: string,
  ): Promise<unknown[]> {
    switch (family) {
      case "sleep":
        return this.health.getSleep(start, end);
      case "heartRate":
        return this.health.getHeartRate(start, end);
      case "hrv":
        return this.health.getHrv(start, end);
      case "activity":
        return this.health.getActivity(start, end);
    }
  }
}
