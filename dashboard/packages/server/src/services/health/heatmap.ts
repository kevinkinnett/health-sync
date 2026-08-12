import type {
  DayOfWeekHeatmapData,
  DayOfWeekHeatmapMetric,
} from "@health-dashboard/shared";
import type { ActivityRepository } from "../../repositories/activityRepo.js";
import type { SleepRepository } from "../../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../../repositories/heartRateRepo.js";
import { avg } from "../stats.js";
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

  async getDayOfWeekHeatmap(today?: string): Promise<DayOfWeekHeatmapData> {
    const [activity, sleep, heartRate] = await Promise.all([
      this.activityRepo.findLatest(201),
      this.sleepRepo.findLatest(201),
      this.heartRateRepo.findLatest(201),
    ]);
    const completedActivity = today
      ? activity.filter((day) => day.date < today).slice(0, 200)
      : activity.slice(0, 200);

    const completedSleep = today
      ? sleep.filter((day) => day.date < today).slice(0, 200)
      : sleep.slice(0, 200);
    const completedHeartRate = today
      ? heartRate.filter((day) => day.date < today).slice(0, 200)
      : heartRate.slice(0, 200);
    const sleepRegime = [...completedSleep]
      .sort((a, b) => b.date.localeCompare(a.date))[0]?.measurementMethod ?? null;
    const sameMethodSleep = sleepRegime == null
      ? completedSleep
      : completedSleep.filter((day) => day.measurementMethod === sleepRegime);

    const sleepByDate = new Map(sameMethodSleep.map((d) => [d.date, d]));
    const hrByDate = new Map(completedHeartRate.map((d) => [d.date, d]));

    // Buckets per day-of-week (0=Sun..6=Sat)
    const buckets: Bucket[] = Array.from({ length: 7 }, () => ({
      steps: [], activeMin: [], distance: [], calories: [],
      sleepMin: [], deepMin: [], efficiency: [], rhr: [],
    }));
    const dayCounts = new Array(7).fill(0);

    for (const a of completedActivity) {
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
        samples: buckets.map((bucket) => bucket[key].length),
        min: Math.min(...valid),
        max: Math.max(...valid),
      });
    }

    const startDow = 1; // conventional Monday → Sunday aggregate

    return {
      dayNames: rotateDow(DAY_NAMES, startDow),
      // Kept for wire compatibility. Aggregates do not map to one recent date.
      dayDates: [],
      rows: rows.map((row) => ({
        ...row,
        values: rotateDow(row.values, startDow),
        samples: rotateDow(row.samples ?? [], startDow),
      })),
      totalDays: completedActivity.filter((d) => d.steps != null).length,
      dayCounts: rotateDow(dayCounts, startDow),
      measurementRegimes: { sleep: sleepRegime },
    };
  }
}
