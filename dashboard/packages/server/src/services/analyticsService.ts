import type {
  SupplementAdherence,
  IntakeByDay,
  IngredientByDay,
  IntakeCorrelations,
} from "@health-dashboard/shared";
import type { SupplementRepository } from "../repositories/supplementRepo.js";
import type { MedicationRepository } from "../repositories/medicationRepo.js";
import type { ActivityRepository } from "../repositories/activityRepo.js";
import type { SleepRepository } from "../repositories/sleepRepo.js";
import type { HeartRateRepository } from "../repositories/heartRateRepo.js";
import type { HrvRepository } from "../repositories/hrvRepo.js";
import { describeCorrelation, pearson, shiftDate } from "./stats.js";
import { formatDateInTz, tzDayStartUtc, tzDayEndUtc } from "./userTz.js";

/**
 * Validation error surfaced to the controller as a 404. Used when the
 * caller asks for adherence/correlations on an id that does not exist.
 */
export class AnalyticsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsNotFoundError";
  }
}

/** Day-of-week labels in `Date#getUTCDay` order (0 = Sunday). */
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Minimum joined-day count below which a correlation pair is dropped. */
const MIN_PAIR_DAYS = 7;

/**
 * Reads-only analytical layer over the supplement, medication and
 * health-metric repositories. Mirrors the shape of `HealthDataService`
 * but specialises in cross-domain joins (intake × metric) that don't
 * belong inside the per-domain service files.
 *
 * All numeric outputs are pre-rounded to UI resolution (correlation to
 * 3 decimals, average doses to 2 decimals) so the React layer never
 * has to think about formatting precision.
 */
export class AnalyticsService {
  /**
   * IANA timezone (e.g. `America/New_York`). All TIMESTAMPTZ→day
   * bucketing in this service buckets according to this zone, not UTC,
   * so the user's evening intakes don't bleed into the next calendar
   * day.
   */
  private readonly tz: string;

  constructor(
    private supplementRepo: SupplementRepository,
    private medicationRepo: MedicationRepository,
    private activityRepo: ActivityRepository,
    private sleepRepo: SleepRepository,
    private heartRateRepo: HeartRateRepository,
    private hrvRepo: HrvRepository,
    opts: { userTimezone: string } = { userTimezone: "UTC" },
  ) {
    this.tz = opts.userTimezone;
  }

  // ---------------------------------------------------------------------------
  // Supplements
  // ---------------------------------------------------------------------------

  async getSupplementAdherence(
    itemId: number,
    start: string,
    end: string,
  ): Promise<SupplementAdherence> {
    const item = await this.supplementRepo.getItem(itemId);
    if (!item) {
      throw new AnalyticsNotFoundError(`Supplement item ${itemId} not found`);
    }
    const intakes = await this.supplementRepo.listIntakes(
      tzDayStartUtc(start, this.tz),
      tzDayEndUtc(end, this.tz),
      itemId,
    );
    return buildAdherence(itemId, item.name, start, end, intakes, this.tz);
  }

  async getSupplementIntakeByDay(
    start: string,
    end: string,
    itemId?: number,
  ): Promise<IntakeByDay[]> {
    const intakes = await this.supplementRepo.listIntakes(
      tzDayStartUtc(start, this.tz),
      tzDayEndUtc(end, this.tz),
      itemId,
    );
    return rollupIntakeByDay(intakes, this.tz);
  }

  async getIngredientByDay(
    start: string,
    end: string,
    ingredientId?: number,
  ): Promise<IngredientByDay[]> {
    return this.supplementRepo.listIngredientByDay(
      tzDayStartUtc(start, this.tz),
      tzDayEndUtc(end, this.tz),
      this.tz,
      ingredientId,
    );
  }

  async getSupplementCorrelations(
    itemId: number,
    lagDays: number,
  ): Promise<IntakeCorrelations> {
    const item = await this.supplementRepo.getItem(itemId);
    if (!item) {
      throw new AnalyticsNotFoundError(`Supplement item ${itemId} not found`);
    }
    // Query a generous backstop window; the metric repos return whatever
    // they have. Lag shifts the intake side by `lagDays`, so we widen
    // the metric end so paired days near "today" don't disappear.
    const intakes = await this.supplementRepo.listIntakes(
      undefined,
      undefined,
      itemId,
    );
    const intakeDays = bucketIntakesByDay(intakes, this.tz);
    const shifted = shiftIntakeDays(intakeDays, lagDays);
    const pairs = await this.computeMetricCorrelations(shifted, item.name);
    return {
      itemId,
      itemName: item.name,
      lagDays,
      pairs,
    };
  }

  // ---------------------------------------------------------------------------
  // Medications
  // ---------------------------------------------------------------------------

  async getMedicationAdherence(
    itemId: number,
    start: string,
    end: string,
  ): Promise<SupplementAdherence> {
    const item = await this.medicationRepo.getItem(itemId);
    if (!item) {
      throw new AnalyticsNotFoundError(`Medication item ${itemId} not found`);
    }
    const intakes = await this.medicationRepo.listIntakes(
      tzDayStartUtc(start, this.tz),
      tzDayEndUtc(end, this.tz),
      itemId,
    );
    return buildAdherence(itemId, item.name, start, end, intakes, this.tz);
  }

  async getMedicationIntakeByDay(
    start: string,
    end: string,
    itemId?: number,
  ): Promise<IntakeByDay[]> {
    const intakes = await this.medicationRepo.listIntakes(
      tzDayStartUtc(start, this.tz),
      tzDayEndUtc(end, this.tz),
      itemId,
    );
    return rollupIntakeByDay(intakes, this.tz);
  }

  async getMedicationCorrelations(
    itemId: number,
    lagDays: number,
  ): Promise<IntakeCorrelations> {
    const item = await this.medicationRepo.getItem(itemId);
    if (!item) {
      throw new AnalyticsNotFoundError(`Medication item ${itemId} not found`);
    }
    const intakes = await this.medicationRepo.listIntakes(
      undefined,
      undefined,
      itemId,
    );
    const intakeDays = bucketIntakesByDay(intakes, this.tz);
    const shifted = shiftIntakeDays(intakeDays, lagDays);
    const pairs = await this.computeMetricCorrelations(shifted, item.name);
    return {
      itemId,
      itemName: item.name,
      lagDays,
      pairs,
    };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * For each of the five canonical metrics, inner-joins the metric's
   * daily series with the (possibly shifted) intake-day-set on date,
   * then computes Pearson r over the joined arrays. Pairs with fewer
   * than {@link MIN_PAIR_DAYS} joined days are dropped.
   */
  private async computeMetricCorrelations(
    intakeDays: Map<string, number>,
    itemName: string,
  ): Promise<IntakeCorrelations["pairs"]> {
    if (intakeDays.size === 0) return [];
    const dates = [...intakeDays.keys()].sort();
    const start = dates[0];
    const end = dates[dates.length - 1];
    const [activity, sleep, heartRate, hrv] = await Promise.all([
      this.activityRepo.findByDateRange(start, end),
      this.sleepRepo.findByDateRange(start, end),
      this.heartRateRepo.findByDateRange(start, end),
      this.hrvRepo.findByDateRange(start, end),
    ]);

    const series: Array<{
      metric: IntakeCorrelations["pairs"][number]["metric"];
      label: string;
      humanLabel: string;
      values: Map<string, number>;
    }> = [
      {
        metric: "steps",
        label: "Steps",
        humanLabel: "steps",
        values: numericSeries(activity, "date", "steps"),
      },
      {
        metric: "sleepMin",
        label: "Sleep (min)",
        humanLabel: "sleep duration",
        values: numericSeries(sleep, "date", "totalMinutesAsleep"),
      },
      {
        metric: "deepMin",
        label: "Deep Sleep (min)",
        humanLabel: "deep sleep",
        values: numericSeries(sleep, "date", "minutesDeep"),
      },
      {
        metric: "restingHr",
        label: "Resting HR (bpm)",
        humanLabel: "resting heart rate",
        values: numericSeries(heartRate, "date", "restingHeartRate"),
      },
      {
        metric: "dailyRmssd",
        label: "HRV (RMSSD)",
        humanLabel: "daily HRV",
        values: numericSeries(hrv, "date", "dailyRmssd"),
      },
    ];

    const pairs: IntakeCorrelations["pairs"] = [];
    for (const s of series) {
      const xs: number[] = [];
      const ys: number[] = [];
      const points: Array<{ x: 0 | 1; y: number; date: string }> = [];
      for (const [date, count] of intakeDays) {
        const y = s.values.get(date);
        if (y == null) continue;
        const x: 0 | 1 = count > 0 ? 1 : 0;
        xs.push(x);
        ys.push(y);
        points.push({ x, y, date });
      }
      if (xs.length < MIN_PAIR_DAYS) continue;
      const r = pearson(xs, ys);
      pairs.push({
        metric: s.metric,
        metricLabel: s.label,
        correlation: r,
        n: xs.length,
        points: points.sort((a, b) => a.date.localeCompare(b.date)),
        insight: describeCorrelation(r, itemName, s.humanLabel),
      });
    }
    return pairs;
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

interface IntakeRow {
  itemId: number;
  itemName: string;
  takenAt: string;
  amount: number;
  unit: string;
}

/**
 * Buckets a list of intake rows by *user-local* calendar day, returning
 * a Map<date, doseCount>. Used as the input to the lag-shift and the
 * adherence calculation.
 *
 * Always pass the user's IANA timezone (`tz`) — never rely on the
 * server's local zone or UTC. An evening intake at 20:00 EDT must
 * bucket as the same day, not the following UTC day.
 */
function bucketIntakesByDay(
  intakes: IntakeRow[],
  tz: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of intakes) {
    const day = formatDateInTz(i.takenAt, tz);
    out.set(day, (out.get(day) ?? 0) + 1);
  }
  return out;
}

/**
 * Shifts an intake-day-set by `lagDays`. Positive lag moves the keys
 * *forward* by N days, so an intake on day D appears as if it had been
 * taken on D+lag — which means joining with a metric series on day D+lag
 * is equivalent to comparing today's metric vs intake from N days ago.
 */
function shiftIntakeDays(
  intakeDays: Map<string, number>,
  lagDays: number,
): Map<string, number> {
  if (lagDays === 0) return new Map(intakeDays);
  const out = new Map<string, number>();
  for (const [day, count] of intakeDays) {
    out.set(shiftDate(day, lagDays), count);
  }
  return out;
}

/**
 * Pulls a numeric series out of a list of metric rows, dropping any
 * day where the value is null/undefined. Returns Map<date, value> so
 * the correlation join is O(1) per lookup.
 *
 * Typed loosely on purpose — the metric domain types
 * ({@link ActivityDay} etc.) don't carry an index signature, so we
 * accept any object and let the `keyof T` guard the field names at
 * the call site.
 */
function numericSeries<T>(
  rows: T[],
  dateKey: keyof T,
  valueKey: keyof T,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const v = r[valueKey];
    if (v == null) continue;
    out.set(r[dateKey] as unknown as string, Number(v));
  }
  return out;
}

/**
 * Aggregates a list of intake rows into per-day, per-item totals
 * suitable for charting. Buckets by user-local day (so an evening
 * intake doesn't bleed into tomorrow's bar). Sorted ascending by date
 * (then item name to keep the order stable when multiple items share
 * a day).
 */
function rollupIntakeByDay(intakes: IntakeRow[], tz: string): IntakeByDay[] {
  const byKey = new Map<string, IntakeByDay>();
  for (const i of intakes) {
    const date = formatDateInTz(i.takenAt, tz);
    const key = `${date}|${i.itemId}|${i.unit}`;
    const cur = byKey.get(key);
    if (cur) {
      cur.totalAmount += i.amount;
      cur.count += 1;
    } else {
      byKey.set(key, {
        date,
        itemId: i.itemId,
        itemName: i.itemName,
        totalAmount: i.amount,
        unit: i.unit,
        count: 1,
      });
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.itemName.localeCompare(b.itemName),
  );
}

/**
 * Builds a {@link SupplementAdherence} for the given window. The
 * algorithm walks every calendar day from `start` to `end`, marking
 * days (in the user's timezone) with at least one intake. Streaks are
 * computed against the dense day list so a missing date breaks a
 * streak even if no intake row exists for it.
 */
function buildAdherence(
  itemId: number,
  itemName: string,
  start: string,
  end: string,
  intakes: IntakeRow[],
  tz: string,
): SupplementAdherence {
  const counts = bucketIntakesByDay(intakes, tz);
  const totalDoses = intakes.length;
  const days = enumerateDays(start, end);
  const daily = days.map((date) => ({ date, doses: counts.get(date) ?? 0 }));
  const daysWithIntake = daily.filter((d) => d.doses > 0).length;

  // Best streak across the entire window
  let bestStreak = 0;
  let run = 0;
  for (const d of daily) {
    if (d.doses > 0) {
      run += 1;
      if (run > bestStreak) bestStreak = run;
    } else {
      run = 0;
    }
  }

  // Current streak: walk back from `end` until a zero day
  let currentStreak = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].doses > 0) currentStreak += 1;
    else break;
  }

  // By-DoW averages: average doses per occurrence of that weekday.
  const dowSum: number[] = [0, 0, 0, 0, 0, 0, 0];
  const dowCount: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const d of daily) {
    const dow = new Date(d.date + "T00:00:00Z").getUTCDay();
    dowSum[dow] += d.doses;
    dowCount[dow] += 1;
  }
  const byDayOfWeek = dowSum.map((sum, dow) => ({
    dow,
    dayName: DAY_NAMES[dow],
    avgDoses:
      dowCount[dow] === 0
        ? 0
        : Math.round((sum / dowCount[dow]) * 100) / 100,
  }));

  return {
    itemId,
    itemName,
    start,
    end,
    totalDoses,
    daysWithIntake,
    daysInWindow: daily.length,
    currentStreak,
    bestStreak,
    byDayOfWeek,
    daily,
  };
}

/**
 * Inclusive range of `YYYY-MM-DD` strings from `start` to `end`. Used
 * to densify the adherence calendar so missing days appear with a
 * dose count of zero rather than being skipped.
 */
function enumerateDays(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  // Cap at ~366 days to avoid runaway loops on bad input.
  for (let i = 0; i < 400 && cursor <= end; i++) {
    out.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return out;
}
