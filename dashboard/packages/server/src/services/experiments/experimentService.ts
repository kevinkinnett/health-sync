import type {
  ExperimentReport,
  ExperimentSummary,
  Intervention,
  MetricEffect,
  MetricSeries,
} from "@health-dashboard/shared";
import { gradeConfidence, MIN_READINGS_PER_SIDE, scanConfounds } from "./confounds.js";
import { rankSummaries, toSummary } from "./headline.js";
import {
  METRIC_SPECS,
  type DailyPoint,
  type DailySeriesSource,
  type MetricSpec,
} from "./metricRegistry.js";
import { cohensD, mean, round, stdDev } from "./statistics.js";
import { selectWindows, type WindowPair } from "./windows.js";

/** The slice of the intervention store this engine needs. */
export interface InterventionLookup {
  findById(id: number): Promise<Intervention | null>;
  findAll(): Promise<Intervention[]>;
}

/**
 * Answers "did it work?" for one intervention.
 *
 * Composition only — every rule it applies lives in a module of its own
 * (`windows`, `statistics`, `confounds`, `metricRegistry`), each pure and
 * separately testable. This class picks the windows, pulls the series,
 * computes effects, asks the scanner what might be wrong with the answer,
 * and writes the summary sentence.
 */
export class ExperimentService {
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
    const metrics: MetricEffect[] = [];
    const series: MetricSeries[] = [];
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
      const provenance = combineProvenance([...beforePoints, ...afterPoints]);
      const effect = effectFor(spec, beforeValues, afterValues, provenance);
      metrics.push(effect);

      // The points were fetched to compute the means and then discarded.
      // Keeping them is what lets the report show whether a shift was a
      // step at the changepoint or a drift that predates it — the same
      // mean is consistent with both, and they mean different things.
      series.push({
        metric: spec.key,
        label: spec.label,
        unit: spec.unit,
        betterDirection: spec.betterDirection,
        points: [...beforePoints, ...afterPoints].map((p) => ({
          date: p.date,
          value: round(p.value, 2),
        })),
        beforeMean: effect.before.mean,
        afterMean: effect.after.mean,
        meaningful: effect.meaningful,
        provenance,
      });
    }

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

  // "Meaningful" needs BOTH a shift big enough to care about in the
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

  const caveat =
    confidence === "weak"
      ? " — but something else could explain it"
      : confoundCount > 0
        ? " — with caveats"
        : "";

  return `After "${intervention.name}", ${parts.join("; ")}${caveat}.`;
}
