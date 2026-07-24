import type {
  DayOfWeekHeatmapData,
  DayOfWeekHeatmapMetric,
} from "@health-dashboard/shared";
import type { ActivityRepository } from "../../repositories/activityRepo.js";
import type { SleepRepository } from "../../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../../repositories/heartRateRepo.js";
import { avg } from "../stats.js";
import { addDays } from "../userTz.js";
import { DAY_NAMES, dowOf, rotateDow } from "./dayOfWeek.js";

type Bucket = {
  steps: number[];
  activeMin: number[];
  distance: number[];
  calories: number[];
  sleepMin: number[];
  deepMin: number[];
  efficiency: number[];
  rhr: number[];
};

const METRICS: {
  key: keyof Bucket;
  label: string;
  unit: string;
  decimals: number;
}[] = [
  { key: "steps", label: "Steps", unit: "steps", decimals: 0 },
  { key: "activeMin", label: "Active Minutes", unit: "min", decimals: 0 },
  { key: "distance", label: "Distance", unit: "km", decimals: 1 },
  { key: "calories", label: "Calories", unit: "cal", decimals: 0 },
  { key: "sleepMin", label: "Sleep", unit: "min", decimals: 0 },
  { key: "deepMin", label: "Deep Sleep", unit: "min", decimals: 0 },
  { key: "efficiency", label: "Sleep Efficiency", unit: "%", decimals: 0 },
  { key: "rhr", label: "Resting HR", unit: "bpm", decimals: 0 },
];

/** Per-day-of-week averages across activity, sleep and heart-rate. */
export class HeatmapService {
  constructor(
    private activityRepo: ActivityRepository,
    private sleepRepo: SleepRepository,
    private heartRateRepo: HeartRateRepository,
  ) {}

  async getDayOfWeekHeatmap(): Promise<DayOfWeekHeatmapData> {
    const [activity, sleep, heartRate] = await Promise.all([
      this.activityRepo.findLatest(200),
      this.sleepRepo.findLatest(200),
      this.heartRateRepo.findLatest(200),
    ]);

    const sleepByDate = new Map(sleep.map((d) => [d.date, d]));
    const hrByDate = new Map(heartRate.map((d) => [d.date, d]));

    // Buckets per day-of-week (0=Sun..6=Sat)
    const buckets: Bucket[] = Array.from({ length: 7 }, () => ({
      steps: [], activeMin: [], distance: [], calories: [],
      sleepMin: [], deepMin: [], efficiency: [], rhr: [],
    }));
    const dayCounts = new Array(7).fill(0);

    for (const a of activity) {
      if (a.steps == null) continue;
      const dow = dowOf(a.date);
      dayCounts[dow]++;
      buckets[dow].steps.push(a.steps);
      buckets[dow].activeMin.push((a.minutesFairlyActive ?? 0) + (a.minutesVeryActive ?? 0));
      if (a.distanceKm != null) buckets[dow].distance.push(a.distanceKm);
      if (a.caloriesOut != null) buckets[dow].calories.push(a.caloriesOut);

      const s = sleepByDate.get(a.date);
      if (s?.totalMinutesAsleep != null) buckets[dow].sleepMin.push(s.totalMinutesAsleep);
      if (s?.minutesDeep != null) buckets[dow].deepMin.push(s.minutesDeep);
      if (s?.efficiency != null) buckets[dow].efficiency.push(s.efficiency);

      const h = hrByDate.get(a.date);
      if (h?.restingHeartRate != null) buckets[dow].rhr.push(h.restingHeartRate);
    }

    const rows: DayOfWeekHeatmapMetric[] = [];
    for (const { key, label, unit, decimals } of METRICS) {
      const factor = 10 ** decimals;
      const values = buckets.map((b) => {
        const vals = b[key];
        if (vals.length === 0) return null;
        return Math.round(avg(vals) * factor) / factor;
      });
      const valid = values.filter((v): v is number => v != null);
      if (valid.length === 0) continue;
      rows.push({
        metric: key,
        label,
        unit,
        values,
        min: Math.min(...valid),
        max: Math.max(...valid),
      });
    }

    // Rotate the columns so today's day-of-week sits in the RIGHTMOST cell.
    // Without this the table renders in fixed Sun→Sat calendar order, but
    // the rest of the dashboard treats "today" as the most recent point in
    // a rolling 7-day window — so the heatmap header and the WeeklyInsights
    // bars would tell different stories about the same week. Aligning to
    // the rolling window keeps the right edge as "now" everywhere.
    const latestDow = activity.length > 0 ? dowOf(activity[0].date) : 0;
    const startDow = (latestDow + 1) % 7;

    // The actual date behind each (rotated) column: the rightmost column is
    // the latest day, so column i maps to latestDate − (6 − i).
    const latestDate = activity.length > 0 ? activity[0].date : null;
    const dayDates = latestDate
      ? Array.from({ length: 7 }, (_, i) => addDays(latestDate, i - 6))
      : [];

    return {
      dayNames: rotateDow(DAY_NAMES, startDow),
      dayDates,
      rows: rows.map((r) => ({ ...r, values: rotateDow(r.values, startDow) })),
      totalDays: activity.filter((d) => d.steps != null).length,
      dayCounts: rotateDow(dayCounts, startDow),
    };
  }
}
