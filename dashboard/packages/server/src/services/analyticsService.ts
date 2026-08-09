import type {
  SupplementAdherence,
  DoseResponseSummary,
  LagProfile,
  IntakeByDay,
  IngredientByDay,
  IntakeCorrelations,
} from "@health-dashboard/shared";
import type {
  ActivitySeriesPort,
  HeartRateSeriesPort,
  HrvSeriesPort,
  MedicationAnalyticsPort,
  SleepSeriesPort,
  SupplementAnalyticsPort,
} from "./analytics/ports.js";
import { describeCorrelation, pearson } from "./stats.js";
import {
  addDays,
  formatDateInTz,
  tzDayStartUtc,
  tzDayEndUtc,
} from "./userTz.js";

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
    private readonly supplementRepo: SupplementAnalyticsPort,
    private readonly medicationRepo: MedicationAnalyticsPort,
    private readonly activityRepo: ActivitySeriesPort,
    private readonly sleepRepo: SleepSeriesPort,
    private readonly heartRateRepo: HeartRateSeriesPort,
    private readonly hrvRepo: HrvSeriesPort,
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
    const { days, xLabel } = doseSeriesByDay(intakes, this.tz);
    const filled = fillSkippedDays(days, this.lastCompleteDay());
    const shifted = shiftIntakeDays(filled, lagDays);
    const pairs = await this.computeMetricCorrelations(shifted, item.name, xLabel);
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
    const { days, xLabel } = doseSeriesByDay(intakes, this.tz);
    const filled = fillSkippedDays(days, this.lastCompleteDay());
    const shifted = shiftIntakeDays(filled, lagDays);
    const pairs = await this.computeMetricCorrelations(shifted, item.name, xLabel);
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
   * The most recent COMPLETE calendar day in the user's timezone
   * (yesterday). Intake analyses clamp here so the in-progress day's
   * partial metrics — or its not-yet-logged dose — never skew a level
   * mean or correlation.
   */
  private lastCompleteDay(): string {
    return addDays(formatDateInTz(new Date().toISOString(), this.tz), -1);
  }

  /**
   * Groups every joined day by its total daily dose and averages each
   * metric per level — the long-horizon view that suits slow-acting
   * medications (an SSRI's effects build over weeks; the day-lag
   * correlations can't see that, a 20mg-era vs 10mg-era comparison can).
   * Level 0 collects the skipped days inside the span.
   */
  async getMedicationDoseResponse(itemId: number): Promise<DoseResponseSummary> {
    const item = await this.medicationRepo.getItem(itemId);
    if (!item) {
      throw new AnalyticsNotFoundError(`Medication item ${itemId} not found`);
    }
    const intakes = await this.medicationRepo.listIntakes(
      undefined,
      undefined,
      itemId,
    );
    const { days, xLabel } = doseSeriesByDay(intakes, this.tz);
    const filled = fillSkippedDays(days, this.lastCompleteDay());
    if (filled.size === 0) {
      return { itemId, itemName: item.name, xLabel, levels: [], metrics: [] };
    }

    const datesByDose = new Map<number, string[]>();
    for (const [date, dose] of filled) {
      const list = datesByDose.get(dose);
      if (list) list.push(date);
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

    const allDates = [...filled.keys()].sort();
    const series = await this.fetchMetricSeries(
      allDates[0],
      allDates[allDates.length - 1],
    );
    const metrics = series.map((s) => {
      const agg = new Map<number, number[]>();
      for (const [date, dose] of filled) {
        const y = s.values.get(date);
        if (y == null) continue;
        const list = agg.get(dose);
        if (list) list.push(y);
        else agg.set(dose, [y]);
      }
      return {
        metric: s.metric,
        metricLabel: s.label,
        byLevel: [...agg.entries()]
          .map(([dose, values]) => ({
            dose,
            n: values.length,
            mean: Math.round((values.reduce((x, y) => x + y, 0) / values.length) * 10) / 10,
            // Raw readings so the client can draw the distribution and
            // judge overlap (rounded to keep the payload light).
            values: values.map((v) => Math.round(v * 10) / 10),
          }))
          .sort((a, b) => a.dose - b.dose),
      };
    });

    return { itemId, itemName: item.name, xLabel, levels, metrics };
  }

  /**
   * Cross-correlation profile: r between the medication's daily dose
   * series and each metric across day-lags 0..maxLag, in one sweep. The
   * metric series is fetched ONCE over the widest shifted window, then
   * re-joined in memory per lag — no per-lag DB round-trips.
   */
  async getMedicationLagProfile(
    itemId: number,
    maxLag = 7,
  ): Promise<LagProfile> {
    const item = await this.medicationRepo.getItem(itemId);
    if (!item) {
      throw new AnalyticsNotFoundError(`Medication item ${itemId} not found`);
    }
    const intakes = await this.medicationRepo.listIntakes(undefined, undefined, itemId);
    const { days } = doseSeriesByDay(intakes, this.tz);
    const filled = fillSkippedDays(days, this.lastCompleteDay());
    if (filled.size === 0) {
      return { itemId, itemName: item.name, maxLag, metrics: [] };
    }

    const dates = [...filled.keys()].sort();
    // Series must cover every lag-shifted date: lag L maps dose-day D → D+L.
    const series = await this.fetchMetricSeries(
      dates[0],
      addDays(dates[dates.length - 1], maxLag),
    );

    const metrics = series.map((s) => ({
      metric: s.metric,
      metricLabel: s.label,
      points: Array.from({ length: maxLag + 1 }, (_, lag) => {
        const shifted = shiftIntakeDays(filled, lag);
        const { r, n } = joinPearson(shifted, s.values);
        return { lag, r, n };
      }),
    }));

    return { itemId, itemName: item.name, maxLag, metrics };
  }

  /**
   * Loads the five canonical daily metric series for a date window —
   * the shared input of both the correlation pairs and the dose-level
   * comparison.
   */
  private async fetchMetricSeries(
    start: string,
    end: string,
  ): Promise<
    Array<{
      metric: IntakeCorrelations["pairs"][number]["metric"];
      label: string;
      humanLabel: string;
      values: Map<string, number>;
    }>
  > {
    const [activity, sleep, heartRate, hrv] = await Promise.all([
      this.activityRepo.findByDateRange(start, end),
      this.sleepRepo.findByDateRange(start, end),
      this.heartRateRepo.findByDateRange(start, end),
      this.hrvRepo.findByDateRange(start, end),
    ]);
    return [
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
  }

  /**
   * For each of the five canonical metrics, inner-joins the intake
   * dose series (0 on skipped days) with the metric's daily series on
   * date, then computes Pearson r over the joined arrays. Pairs with
   * fewer than {@link MIN_PAIR_DAYS} joined days are dropped. When the
   * dose series has no variation across the joined days (logged every
   * day at the same dose), r is undefined — the pair is returned with
   * `correlation: null` and an insight that says why, instead of a
   * misleading r=0.
   */
  private async computeMetricCorrelations(
    intakeDays: Map<string, number>,
    itemName: string,
    xLabel: string,
  ): Promise<IntakeCorrelations["pairs"]> {
    if (intakeDays.size === 0) return [];
    const dates = [...intakeDays.keys()].sort();
    const series = await this.fetchMetricSeries(
      dates[0],
      dates[dates.length - 1],
    );

    const pairs: IntakeCorrelations["pairs"] = [];
    for (const s of series) {
      const xs: number[] = [];
      const ys: number[] = [];
      const points: Array<{ x: number; y: number; date: string }> = [];
      for (const [date, dose] of intakeDays) {
        const y = s.values.get(date);
        if (y == null) continue;
        xs.push(dose);
        ys.push(y);
        points.push({ x: dose, y, date });
      }
      if (xs.length < MIN_PAIR_DAYS) continue;
      const degenerate = new Set(xs).size < 2;
      const r = degenerate ? null : pearson(xs, ys);
      pairs.push({
        metric: s.metric,
        metricLabel: s.label,
        xLabel,
        correlation: r,
        n: xs.length,
        points: points.sort((a, b) => a.date.localeCompare(b.date)),
        insight:
          r === null
            ? `${itemName} was logged every joined day at the same dose — ` +
              `there's no variation to correlate against ${s.humanLabel}. ` +
              `A dose change or skipped days is what makes this comparison meaningful.`
            : describeCorrelation(r, itemName, s.humanLabel),
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
 * Buckets intake rows by *user-local* calendar day into per-day intake
 * COUNTS — the input the adherence calculation wants (its heatmap and
 * day-of-week averages are about how many times, not how much).
 */
function countIntakesByDay(
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
 * Buckets intake rows into a per-*user-local*-day dose series for the
 * correlation join: Map<date, totalDose>. When every intake shares one
 * unit the value is the day's summed amount (e.g. 20 for 2×10 mg) and
 * the label names it; with mixed units amounts aren't summable, so the
 * value falls back to the day's intake count.
 *
 * Always pass the user's IANA timezone (`tz`) — never rely on the
 * server's local zone or UTC. An evening intake at 20:00 EDT must
 * bucket as the same day, not the following UTC day.
 */
function doseSeriesByDay(
  intakes: IntakeRow[],
  tz: string,
): { days: Map<string, number>; xLabel: string } {
  const units = new Set(intakes.map((i) => i.unit));
  const uniform = units.size === 1;
  const days = new Map<string, number>();
  for (const i of intakes) {
    const day = formatDateInTz(i.takenAt, tz);
    days.set(day, (days.get(day) ?? 0) + (uniform ? i.amount : 1));
  }
  // Round summed doses to the column's NUMERIC(10,3) resolution — float
  // noise (0.1+0.2 = 0.30000000000000004) must not mint a distinct dose
  // level or leak into axis labels.
  for (const [day, dose] of days) {
    days.set(day, Math.round(dose * 1000) / 1000);
  }
  return {
    days,
    xLabel: uniform ? `Daily dose (${[...units][0]})` : "Doses taken (count)",
  };
}

/**
 * Inner-joins a dose-day map with a metric series on date and returns
 * Pearson r (+ joined-day count). r is null when too few days overlap
 * (< {@link MIN_PAIR_DAYS}) or the dose has no variation across them
 * (constant x → r undefined, not zero). Used by the lag-profile sweep,
 * which re-joins the same pre-fetched series at every lag.
 */
function joinPearson(
  doseDays: Map<string, number>,
  values: Map<string, number>,
): { r: number | null; n: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [date, dose] of doseDays) {
    const y = values.get(date);
    if (y == null) continue;
    xs.push(dose);
    ys.push(y);
  }
  const n = xs.length;
  if (n < MIN_PAIR_DAYS || new Set(xs).size < 2) return { r: null, n };
  return { r: pearson(xs, ys), n };
}

/**
 * Densifies a dose-day series: every calendar day from the first
 * logged day through `endDay` (inclusive) gets an entry, with 0 for
 * skipped days. Without this the correlation join only ever sees
 * "taken" days — x is constant and r is structurally undefined, which
 * is exactly the bug this replaces. Zero days are the control group;
 * for a discontinued item the trailing zeros capture the off-item
 * contrast, which is the comparison being asked for.
 *
 * The window is CLAMPED to `endDay` — callers pass *yesterday* so the
 * incomplete current day never enters an analysis as a phantom
 * "skipped" day (or with partial metrics), and a future-dated intake
 * (typo'd year, pre-logged dose) can't inject not-yet-occurred days.
 */
function fillSkippedDays(
  days: Map<string, number>,
  endDay: string,
): Map<string, number> {
  if (days.size === 0) return new Map();
  const sorted = [...days.keys()].sort();
  if (sorted[0] > endDay) return new Map();
  const out = new Map<string, number>();
  for (let d = sorted[0]; d <= endDay; d = addDays(d, 1)) {
    out.set(d, days.get(d) ?? 0);
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
    out.set(addDays(day, lagDays), count);
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
  const counts = countIntakesByDay(intakes, tz);
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
    cursor = addDays(cursor, 1);
  }
  return out;
}
