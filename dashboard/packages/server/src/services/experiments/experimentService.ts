import type {
  ExperimentReport,
  Intervention,
  MetricEffect,
} from "@health-dashboard/shared";
import { gradeConfidence, scanConfounds } from "./confounds.js";
import { METRIC_SPECS, type DailySeriesSource, type MetricSpec } from "./metricRegistry.js";
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

    const windows = selectWindows(intervention, today);
    const metrics: MetricEffect[] = [];
    let beforeObserved = 0;
    let afterObserved = 0;

    for (const spec of this.specs) {
      const [beforePoints, afterPoints] = await Promise.all([
        this.series.fetch(spec.key, windows.before.start, windows.before.end),
        this.series.fetch(spec.key, windows.after.start, windows.after.end),
      ]);

      beforeObserved = Math.max(beforeObserved, beforePoints.length);
      afterObserved = Math.max(afterObserved, afterPoints.length);

      // A metric with nothing on one side cannot be compared; omit it
      // rather than render a row of dashes.
      if (beforePoints.length === 0 || afterPoints.length === 0) continue;

      metrics.push(effectFor(spec, beforePoints.map((p) => p.value), afterPoints.map((p) => p.value)));
    }

    const coverage = {
      before: windows.before.days > 0 ? beforeObserved / windows.before.days : 0,
      after: windows.after.days > 0 ? afterObserved / windows.after.days : 0,
    };

    const others = await this.interventions.findAll();
    const confounds = scanConfounds(intervention, others, windows, coverage);
    const confidence = gradeConfidence(metrics, confounds, windows);

    return {
      interventionId: intervention.id,
      interventionName: intervention.name,
      changepoint: intervention.startedOn,
      before: withObserved(windows.before, beforeObserved),
      after: withObserved(windows.after, afterObserved),
      metrics,
      confounds,
      confidence,
      summary: summarize(intervention, metrics, confidence, confounds.length),
    };
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
  // the night-to-night spread is 90 minutes.
  const meaningful =
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
