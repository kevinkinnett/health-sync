import type { CorrelationPair } from "@health-dashboard/shared";
import { describeCorrelation, pearson } from "./stats.js";
import { addDays } from "./userTz.js";
import {
  adjustFalseDiscoveryRate,
  blockBootstrapCorrelationInterval,
  circularShiftPValue,
  correlationStability,
  spearman,
} from "./analysis/statistics.js";

/**
 * Generalized cross-metric correlation engine.
 *
 * Every health signal is registered once as a `MetricSeries` (a date →
 * value map plus display strings), and the interesting comparisons are
 * declared as `PairSpec`s — one line each instead of a hand-written
 * ~20-line filter/pearson/push block per pair. Adding a new signal to
 * correlations = one `seriesFrom` call + the pair specs that mention it.
 *
 * Lag support: a spec may set `lag` (days), pairing x on day D with y on
 * day D+lag. That's how "does today's X cost me tomorrow's Y?" questions
 * are expressed (e.g. time in car → next-day readiness). Day attribution
 * matters here: Fitbit/Eight Sleep date sleep and overnight signals by
 * the WAKE date, so "tonight's sleep" relative to daytime activity on
 * day D lives on date D+1 — lag 1, not 0.
 *
 * PURE (no DB, no clock) so the join/lag math is unit-testable.
 */

export interface MetricSeries {
  /** Wire id used as CorrelationPair.xMetric/yMetric (e.g. "minutesInCar"). */
  key: string;
  /** Axis label (e.g. "Time in Car (min)"). */
  label: string;
  /** Plain-English noun for insight sentences (e.g. "time in car"). */
  noun: string;
  /** date (YYYY-MM-DD) → value. */
  values: Map<string, number>;
}

export interface PairSpec {
  x: string;
  y: string;
  /** Sample y this many days AFTER x. 0/omitted = same-day pair. */
  lag?: number;
  /**
   * Wording overrides for lag pairs. "next-day" (the default) is right
   * for morning-scored metrics like readiness, but WRONG for wake-dated
   * overnight metrics: sleep recorded on D+1 is the night that BEGINS on
   * day D — i.e. "that night", not "the next day". Specs pairing daytime
   * X with overnight Y should set these.
   */
  ySuffix?: string;
  /** Full noun phrase for the insight sentence, e.g. "sleep that night". */
  yNounForm?: string;
}

/** Minimum overlapping days before a pair is worth surfacing. */
export const MIN_OVERLAP_DAYS = 10;

/** Build a MetricSeries from repo rows, skipping null/undefined values. */
export function seriesFrom<T extends { date: string }>(
  key: string,
  label: string,
  noun: string,
  rows: T[],
  value: (row: T) => number | null | undefined,
): MetricSeries {
  const values = new Map<string, number>();
  for (const row of rows) {
    const v = value(row);
    if (v != null) values.set(row.date, v);
  }
  return { key, label, noun, values };
}

/**
 * Join each spec's two series on the (lag-shifted) day grain and compute
 * Pearson r. Pairs whose series overlap on fewer than `minN` days are
 * silently skipped — they appear automatically once enough data has been
 * ingested. (A spec naming an unregistered series key is also skipped;
 * that only masks a typo in the spec list, never missing data.)
 * `points[].date` is the X day; points are in ascending date order.
 */
export function computeCorrelationPairs(
  series: Map<string, MetricSeries>,
  specs: PairSpec[],
  minN: number = MIN_OVERLAP_DAYS,
): CorrelationPair[] {
  const pairs: CorrelationPair[] = [];
  const rawPValues: number[] = [];

  for (const spec of specs) {
    const xs = series.get(spec.x);
    const ys = series.get(spec.y);
    if (!xs || !ys) continue;
    const lag = spec.lag ?? 0;

    const points: { x: number; y: number; date: string }[] = [];
    for (const date of [...xs.values.keys()].sort()) {
      const yv = ys.values.get(lag === 0 ? date : addDays(date, lag));
      if (yv == null) continue;
      points.push({ x: xs.values.get(date)!, y: yv, date });
    }
    if (points.length < minN) continue;

    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    const r = pearson(xValues, yValues);
    rawPValues.push(circularShiftPValue(xValues, yValues));
    const suffix = spec.ySuffix ?? defaultLagSuffix(lag);
    const yLabel = lag > 0 ? `${ys.label} (${suffix})` : ys.label;
    const yNoun =
      lag > 0 ? (spec.yNounForm ?? defaultLagNoun(ys.noun, lag)) : ys.noun;
    pairs.push({
      xMetric: spec.x,
      yMetric: spec.y,
      xLabel: xs.label,
      yLabel,
      correlation: r,
      points,
      insight: describeCorrelation(r, xs.noun, yNoun),
      lagDays: lag,
      evidence: "exploratory_association",
      spearman: spearman(xValues, yValues),
      confidenceInterval: blockBootstrapCorrelationInterval(
        xValues, yValues, `${spec.x}:${spec.y}:${lag}`,
      ),
      stability: correlationStability(xValues, yValues),
    });
  }

  const adjusted = adjustFalseDiscoveryRate(rawPValues);
  return pairs.map((pair, index) => ({
    ...pair,
    adjustedPValue: adjusted[index],
    notableAfterCorrection:
      adjusted[index] <= 0.1 && pair.stability !== "unstable",
  }));
}

function defaultLagSuffix(lag: number): string {
  return lag === 1 ? "next-day" : `${lag} days later`;
}

function defaultLagNoun(noun: string, lag: number): string {
  return lag === 1 ? `next-day ${noun}` : `${noun} ${lag} days later`;
}

/**
 * Fill calendar gaps INSIDE a series' own [min, max] date span with a
 * constant. For event-derived rollups (e.g. Tesla drives) the source
 * table simply has no row on event-free days — but "no drives" is a
 * real observation of 0 minutes, and without it every correlation
 * involving the series is conditioned on "days the event happened",
 * which both biases r and silently shrinks n. Filling only within the
 * observed span avoids fabricating zeros for periods before the data
 * source existed (or after it stopped reporting).
 */
export function fillMissingDays(s: MetricSeries, fill: number): MetricSeries {
  const dates = [...s.values.keys()].sort();
  if (dates.length < 2) return s;
  const values = new Map(s.values);
  let d = dates[0];
  const last = dates[dates.length - 1];
  while (d < last) {
    d = addDays(d, 1);
    if (!values.has(d)) values.set(d, fill);
  }
  return { ...s, values };
}
