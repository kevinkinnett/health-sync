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
  measurement: string;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const EXTRACTORS: Record<string, Extractor> = {
  sleepMin: { family: "sleep", pick: (r) => num(r.totalMinutesAsleep), measurement: "Main overnight sleep duration" },
  inBedMin: { family: "sleep", pick: (r) => num(r.totalMinutesInBed), measurement: "Main overnight time in bed" },
  efficiency: { family: "sleep", pick: (r) => num(r.efficiency), measurement: "Main overnight sleep efficiency" },
  wakeMin: { family: "sleep", pick: (r) => num(r.minutesWake), measurement: "Main overnight awake time" },
  deepMin: { family: "sleep", pick: (r) => num(r.minutesDeep), measurement: "Main overnight deep sleep" },
  remMin: { family: "sleep", pick: (r) => num(r.minutesRem), measurement: "Main overnight REM sleep" },
  restingHr: { family: "heartRate", pick: (r) => num(r.restingHeartRate), measurement: "Daily resting heart rate" },
  dailyRmssd: { family: "hrv", pick: (r) => num(r.dailyRmssd), measurement: "Overnight HRV (RMSSD)" },
  steps: { family: "activity", pick: (r) => num(r.steps), measurement: "Daily steps" },
  activeMinutes: {
    family: "activity",
    pick: (r) =>
      (num(r.minutesFairlyActive) ?? 0) + (num(r.minutesVeryActive) ?? 0),
    measurement: "Daily fairly + very active minutes",
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
        const method = (row as { measurementMethod?: unknown }).measurementMethod;
        points.push({
          date,
          value,
          provenance: {
            deviceLabel: "Fitbit wearable",
            providerLabel: "Fitbit history / Google Health API",
            measurement: extractor.measurement,
            regimes: [typeof method === "string" ? method : `${extractor.family}_daily_rollup_v1`],
          },
        });
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
