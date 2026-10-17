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

/**
 * A charger or non-wear day still produces an activity row, with zero
 * steps. Counting it would read compliance as behaviour, so activity
 * metrics only use days the tracker was worn — the same rule the
 * correlations engine applies.
 */
const isWearDay = (r: Record<string, unknown>): boolean => {
  const steps = num(r.steps);
  return steps != null && steps > 0;
};

const EXTRACTORS: Record<string, Extractor> = {
  sleepMin: { family: "sleep", pick: (r) => num(r.totalMinutesAsleep), measurement: "Main overnight sleep duration" },
  inBedMin: { family: "sleep", pick: (r) => num(r.totalMinutesInBed), measurement: "Main overnight time in bed" },
  efficiency: { family: "sleep", pick: (r) => num(r.efficiency), measurement: "Main overnight sleep efficiency" },
  wakeMin: { family: "sleep", pick: (r) => num(r.minutesWake), measurement: "Main overnight awake time" },
  deepMin: { family: "sleep", pick: (r) => num(r.minutesDeep), measurement: "Main overnight deep sleep" },
  remMin: { family: "sleep", pick: (r) => num(r.minutesRem), measurement: "Main overnight REM sleep" },
  restingHr: { family: "heartRate", pick: (r) => num(r.restingHeartRate), measurement: "Daily resting heart rate" },
  dailyRmssd: { family: "hrv", pick: (r) => num(r.dailyRmssd), measurement: "Overnight HRV (RMSSD)" },
  steps: { family: "activity", pick: (r) => (isWearDay(r) ? num(r.steps) : null), measurement: "Daily steps" },
  activeMinutes: {
    family: "activity",
    pick: (r) => {
      if (!isWearDay(r)) return null;
      const fairly = num(r.minutesFairlyActive);
      const very = num(r.minutesVeryActive);
      // Both columns missing is no reading, not a sedentary day.
      if (fairly == null && very == null) return null;
      return (fairly ?? 0) + (very ?? 0);
    },
    measurement: "Daily fairly + very active minutes",
  },
};

export class HealthSeriesSource implements DailySeriesSource {
  constructor(private readonly health: HealthDataService) {}

  async fetch(metric: string, start: string, end: string): Promise<DailyPoint[]> {
    return (await this.fetchMany([metric], start, end)).get(metric) ?? [];
  }

  /**
   * Reads each table the requested metrics live in once, then extracts
   * every metric from those rows. A full report asks for ten metrics that
   * live in four tables; fetching per metric read the sleep table six
   * times per window for identical rows.
   */
  async fetchMany(
    metrics: string[],
    start: string,
    end: string,
  ): Promise<Map<string, DailyPoint[]>> {
    const families = [...new Set(
      metrics.flatMap((metric) => EXTRACTORS[metric] ? [EXTRACTORS[metric].family] : []),
    )];
    const rowsByFamily = new Map(
      await Promise.all(
        families.map(async (family) => [family, await this.rowsFor(family, start, end)] as const),
      ),
    );

    const out = new Map<string, DailyPoint[]>();
    for (const metric of metrics) {
      const extractor = EXTRACTORS[metric];
      out.set(metric, extractor ? extract(extractor, rowsByFamily.get(extractor.family) ?? []) : []);
    }
    return out;
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

function extract(extractor: Extractor, rows: unknown[]): DailyPoint[] {
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
