import type {
  ExperimentReport,
  ExperimentSummary,
  Intervention,
  MetricEffect,
  MetricSeries,
} from "@health-dashboard/shared";
import {
  beatsReportNull,
  calibrate,
  excludeDraws,
  HISTORY_DAYS,
  METRIC_ALPHA,
  placeboDraws,
  stepWindowDays,
  type PlaceboDraw,
} from "./calibration.js";
import {
  gradeConfidence,
  MEASUREMENT_CHANGES,
  MIN_READINGS_PER_SIDE,
  scanConfounds,
} from "./confounds.js";
import { rankSummaries, toSummary } from "./headline.js";
import {
  METRIC_SPECS,
  type DailyPoint,
  type DailySeriesSource,
  type MetricSpec,
} from "./metricRegistry.js";
import { cohensD, mean, round, stdDev } from "./statistics.js";
import { selectWindows, type WindowPair } from "./windows.js";
import { addDays } from "../userTz.js";

/** The slice of the intervention store this engine needs. */
export interface InterventionLookup {
  findById(id: number): Promise<Intervention | null>;
  findAll(): Promise<Intervention[]>;
}

/**
 * Answers "did it work?" for one intervention.
 *
 * Composition only — every rule it applies lives in a module of its own
 * (`windows`, `statistics`, `calibration`, `confounds`, `metricRegistry`),
 * each pure and separately testable. This class picks the windows, pulls
 * the series, computes effects, ranks them against the person's own
 * placebo null, asks the scanner what might be wrong with the answer, and
 * writes the summary sentence.
 */
export class ExperimentService {
  /**
   * The history the placebo nulls are built from, and the nulls themselves
   * per metric and window length — shared by every report for one `today`.
   * The home screen runs several reports per load; without this each would
   * re-read three years of four tables. One day's entry is kept: the
   * history changes daily, and the null for a date that has passed is
   * never asked for again.
   */
  private calibrationDay: {
    today: string;
    history: Promise<Map<string, DailyPoint[]>>;
    draws: Map<string, PlaceboDraw[]>;
  } | null = null;

  constructor(
    private readonly interventions: InterventionLookup,
    private readonly series: DailySeriesSource,
    private readonly specs: MetricSpec[] = METRIC_SPECS,
  ) {}

  async report(interventionId: number, today: string): Promise<ExperimentReport> {
    const intervention = await this.interventions.findById(interventionId);
    if (!intervention) {
      throw new Error(`Intervention ${interventionId} not found`);
    }
    return this.reportFor(intervention, await this.interventions.findAll(), today);
  }

  /**
   * The report itself, given the intervention list already in hand — so
   * `summaries()` can run several reports off its one `findAll()` rather
   * than re-reading the store twice per report.
   */
  private async reportFor(
    intervention: Intervention,
    others: Intervention[],
    today: string,
  ): Promise<ExperimentReport> {
    const windows = selectWindows(intervention, today);
    const compared: {
      spec: MetricSpec;
      points: DailyPoint[];
      effect: MetricEffect;
      step: number | null;
    }[] = [];
    const stepDays = stepWindowDays(windows.after.days);
    let beforeObserved = 0;
    let afterObserved = 0;

    const keys = this.specs.map((spec) => spec.key);
    const [beforeByMetric, afterByMetric] = await Promise.all([
      this.fetchAll(keys, windows.before.start, windows.before.end),
      this.fetchAll(keys, windows.after.start, windows.after.end),
    ]);

    for (const spec of this.specs) {
      const beforePoints = beforeByMetric.get(spec.key) ?? [];
      // An ongoing after window runs to today, and today's step count is
      // whatever has accumulated so far — a half-day total, not a reading.
      const afterPoints = (afterByMetric.get(spec.key) ?? []).filter(
        (p) => !spec.accumulatesThroughDay || p.date < today,
      );

      beforeObserved = Math.max(beforeObserved, beforePoints.length);
      afterObserved = Math.max(afterObserved, afterPoints.length);

      // A metric with nothing on one side cannot be compared; omit it
      // rather than render a row of dashes.
      if (beforePoints.length === 0 || afterPoints.length === 0) continue;

      const beforeValues = beforePoints.map((p) => p.value);
      const afterValues = afterPoints.map((p) => p.value);
      const points = [...beforePoints, ...afterPoints];
      const effect = effectFor(spec, beforeValues, afterValues, combineProvenance(points));
      const step = stepEffect(beforePoints, afterPoints, stepDays, intervention.startedOn);
      compared.push({ spec, points, effect, step });
    }
    const metrics = compared.map((c) => c.effect);

    // Whether a shift is unusual can only be said against this person's
    // own history: the same step at every past date where nothing was
    // logged — this change included, so it never sits in its own null.
    const calibrations = await this.calibrations(
      new Map(compared.flatMap((c) => c.step == null ? [] : [[c.spec.key, c.step] as const])),
      stepDays,
      boundariesOf([intervention, ...others]),
      today,
    );
    for (const effect of metrics) {
      const calibration = calibrations.get(effect.metric);
      if (calibration) effect.calibration = calibration;
      // Large in its own unit and against its own spread is necessary but
      // not enough: on a drifting series it is true at most dates. The
      // step at the change must be rare, and point the same way as the
      // shift being claimed — a rise that happened a month before the
      // change and partly reversed at it is not the change's doing.
      effect.meaningful =
        effect.meaningful &&
        calibration != null &&
        calibration.exceedance <= METRIC_ALPHA &&
        Math.sign(calibration.effectSize) === Math.sign(effect.delta);
    }

    // The points were fetched to compute the means and then discarded.
    // Keeping them is what lets the report show whether a shift was a
    // step at the changepoint or a drift that predates it — the same
    // mean is consistent with both, and they mean different things.
    const series: MetricSeries[] = compared.map(({ spec, points, effect }) => ({
      metric: spec.key,
      label: spec.label,
      unit: spec.unit,
      betterDirection: spec.betterDirection,
      points: points.map((p) => ({ date: p.date, value: round(p.value, 2) })),
      beforeMean: effect.before.mean,
      afterMean: effect.after.mean,
      meaningful: effect.meaningful,
      provenance: effect.provenance,
    }));

    const coverage = {
      before: windows.before.days > 0 ? beforeObserved / windows.before.days : 0,
      after: windows.after.days > 0 ? afterObserved / windows.after.days : 0,
    };

    const confounds = scanConfounds(
      intervention,
      others,
      windows,
      coverage,
      metrics.map((metric) => metric.metric),
    );
    const confidence = gradeConfidence(metrics, confounds, windows);

    return {
      interventionId: intervention.id,
      interventionName: intervention.name,
      interventionCategory: intervention.category,
      evidence: "observed_change",
      changepoint: intervention.startedOn,
      before: withObserved(windows.before, beforeObserved),
      after: withObserved(windows.after, afterObserved),
      metrics,
      series,
      confounds,
      confidence,
      summary: summarize(intervention, metrics, confidence, confounds.length),
    };
  }

  /**
   * Headline verdicts, for the home screen.
   *
   * Bounded by `limit` on purpose. A full report walks every metric across
   * two windows, so this is one of the most expensive things the app can
   * do; running it for an unbounded intervention list on every dashboard
   * load would make the cost grow silently with the user's own history.
   * The most recent few are also the ones still worth asking about — an
   * intervention from eight months ago is settled.
   *
   * A single failing report must not take the card down with it: one
   * intervention with an unparseable date should cost its own row, not
   * the whole answer. Failures are skipped, not thrown.
   */
  private async fetchAll(
    metrics: string[],
    start: string,
    end: string,
  ): Promise<Map<string, DailyPoint[]>> {
    if (this.series.fetchMany) return this.series.fetchMany(metrics, start, end);
    const fetched = await Promise.all(
      metrics.map(async (metric) => [metric, await this.series.fetch(metric, start, end)] as const),
    );
    return new Map(fetched);
  }

  /**
   * Calibrates each metric's step against placebo steps of the same
   * length drawn from the shared history.
   */
  private async calibrations(
    steps: Map<string, number>,
    windowDays: number,
    boundaries: string[],
    today: string,
  ): Promise<Map<string, NonNullable<MetricEffect["calibration"]>>> {
    if (steps.size === 0) return new Map();
    const day = this.calibrationFor(today);
    const history = await day.history;

    const nulls = new Map<string, PlaceboDraw[]>();
    for (const metric of steps.keys()) {
      const key = `${metric}:${windowDays}`;
      let draws = day.draws.get(key);
      if (!draws) {
        draws = placeboDraws(history.get(metric) ?? [], windowDays, MIN_READINGS_PER_SIDE);
        day.draws.set(key, draws);
      }
      nulls.set(metric, excludeDraws(draws, windowDays, boundaries));
    }
    return calibrate(steps, nulls, windowDays);
  }

  private calibrationFor(today: string): NonNullable<ExperimentService["calibrationDay"]> {
    if (this.calibrationDay?.today !== today) {
      const keys = this.specs.map((spec) => spec.key);
      const history = this.fetchAll(keys, addDays(today, -HISTORY_DAYS), today).then(
        (byMetric) => new Map([...byMetric].map(([metric, points]) => {
          // Today's activity totals are half a day; the placebo windows
          // must be built from readings like the report's own.
          const spec = this.specs.find((s) => s.key === metric);
          return [metric, points.filter((p) => !spec?.accumulatesThroughDay || p.date < today)];
        })),
      );
      const entry = { today, history, draws: new Map<string, PlaceboDraw[]>() };
      // A failed read must not poison the rest of the day.
      history.catch(() => {
        if (this.calibrationDay === entry) this.calibrationDay = null;
      });
      this.calibrationDay = entry;
    }
    return this.calibrationDay!;
  }

  async summaries(today: string, limit = 3): Promise<ExperimentSummary[]> {
    const all = await this.interventions.findAll();
    const recent = [...all]
      .sort((a, b) => b.startedOn.localeCompare(a.startedOn))
      .slice(0, limit);

    const reports = await Promise.all(
      recent.map(async (i) => {
        try {
          return toSummary(await this.reportFor(i, all, today));
        } catch {
          return null;
        }
      }),
    );

    return rankSummaries(reports.filter((r): r is ExperimentSummary => r != null));
  }
}

/**
 * Cohen's d over the `days` either side of `pivot` — the step the change
 * itself can claim. Null when either side is too sparse to compare, by the
 * same rule the placebo steps are held to.
 */
function stepEffect(
  before: DailyPoint[],
  after: DailyPoint[],
  days: number,
  pivot: string,
): number | null {
  const from = addDays(pivot, -days);
  const to = addDays(pivot, days - 1);
  const b = before.filter((p) => p.date >= from).map((p) => p.value);
  const a = after.filter((p) => p.date <= to).map((p) => p.value);
  const needed = Math.max(MIN_READINGS_PER_SIDE, Math.ceil(days / 2));
  if (b.length < needed || a.length < needed) return null;
  return cohensD(b, a);
}

/** Every date the store records a change on: where placebos must not sit. */
function boundariesOf(interventions: Intervention[]): string[] {
  return [...new Set([
    ...interventions.flatMap((i) => [i.startedOn, i.endedOn ?? null]),
    ...MEASUREMENT_CHANGES.map((change) => change.date),
  ])].filter((d): d is string => d != null);
}

function withObserved(
  window: WindowPair["before"],
  observedDays: number,
): ExperimentReport["before"] {
  return { ...window, observedDays };
}

function effectFor(
  spec: MetricSpec,
  before: number[],
  after: number[],
  provenance?: MetricEffect["provenance"],
): MetricEffect {
  const beforeMean = mean(before);
  const afterMean = mean(after);
  const delta = afterMean - beforeMean;
  const effectSize = cohensD(before, after);

  const direction = Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down";
  const improved =
    direction !== "flat" && direction === spec.betterDirection;

  // The prerequisites of "meaningful"; the report then also requires the
  // shift to be unusual against the person's placebo null (`calibration`).
  // They need BOTH a shift big enough to care about in the
  // metric's own unit and one that is large relative to its variability.
  // Either test alone misleads: a 0.4 bpm change can look enormous on a
  // very stable series, and a 40-minute sleep swing is unremarkable if
  // the night-to-night spread is 90 minutes. And neither test means
  // anything from a handful of readings: the summary and the headline quote
  // this flag, so a metric with three nights a side must not earn it on the
  // strength of denser metrics carrying the report's confidence.
  const meaningful =
    before.length >= MIN_READINGS_PER_SIDE &&
    after.length >= MIN_READINGS_PER_SIDE &&
    Math.abs(delta) >= spec.minMeaningfulDelta &&
    effectSize != null &&
    Math.abs(effectSize) >= 0.3;

  return {
    metric: spec.key,
    label: spec.label,
    unit: spec.unit,
    betterDirection: spec.betterDirection,
    before: { n: before.length, mean: round(beforeMean, 1), sd: round(stdDev(before), 1) },
    after: { n: after.length, mean: round(afterMean, 1), sd: round(stdDev(after), 1) },
    delta: round(delta, 1),
    deltaPct: beforeMean === 0 ? null : round((delta / Math.abs(beforeMean)) * 100, 1),
    direction,
    effectSize: effectSize == null ? null : round(effectSize, 2),
    improved,
    meaningful,
    provenance,
  };
}

function combineProvenance(
  points: Awaited<ReturnType<DailySeriesSource["fetch"]>>,
): MetricEffect["provenance"] {
  const entries = points.flatMap((point) => point.provenance ? [point.provenance] : []);
  const first = entries[0];
  if (!first) return undefined;
  return {
    deviceLabel: first.deviceLabel,
    providerLabel: first.providerLabel,
    measurement: first.measurement,
    regimes: [...new Set(entries.flatMap((entry) => entry.regimes))].sort(),
  };
}

function summarize(
  intervention: Intervention,
  metrics: MetricEffect[],
  confidence: ExperimentReport["confidence"],
  confoundCount: number,
): string {
  if (confidence === "insufficient") {
    return `Not enough data around "${intervention.name}" yet to say whether anything changed.`;
  }

  const moved = metrics.filter((m) => m.meaningful);
  if (moved.length === 0) {
    if (metrics.every((m) => m.calibration == null)) {
      return `Not enough history yet to tell a change after "${intervention.name}" from ordinary ups and downs.`;
    }
    return `Nothing moved meaningfully after "${intervention.name}".`;
  }

  const better = moved.filter((m) => m.improved);
  const worse = moved.filter((m) => !m.improved);
  const parts: string[] = [];
  if (better.length > 0) {
    parts.push(`${better.map((m) => m.label.toLowerCase()).join(", ")} improved`);
  }
  if (worse.length > 0) {
    parts.push(`${worse.map((m) => m.label.toLowerCase()).join(", ")} went the wrong way`);
  }

  // Each listed metric is unusual on its own; with ten compared at once,
  // one of them being that unusual is not, unless it also beats the
  // report-level null — the bar the headline has to clear.
  const caveat =
    confidence === "weak"
      ? " — but something else could explain it"
      : !moved.some(beatsReportNull)
        ? " — though with this many measures compared, a shift this size can be chance"
        : confoundCount > 0
          ? " — with caveats"
          : "";

  return `After "${intervention.name}", ${parts.join("; ")}${caveat}.`;
}
