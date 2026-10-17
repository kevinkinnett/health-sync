import type { MetricCalibration, MetricEffect } from "@health-dashboard/shared";

/**
 * Judges a before/after shift against this person's own history rather
 * than against a textbook effect-size threshold.
 *
 * Why: daily health metrics drift and are autocorrelated. On this user's
 * data two adjacent 30-day windows of resting heart rate differ by
 * |d| ≈ 0.9 at a typical date where nothing changed, so a fixed
 * "|d| ≥ 0.3 is meaningful" rule flagged most metrics on almost every
 * placebo date, and 94–98% of placebo reports earned a home-screen
 * headline (docs/insight-quality-2026-10.md).
 *
 * The fix is the empirical one. Run the SAME comparison — same metric,
 * same window length — at every past date whose two windows contain no
 * logged change, and ask what share of those placebo comparisons moved
 * at least as far as the observed one. That share (the exceedance) is a
 * p-value analogue that needs no independence assumption: the drift,
 * seasonality and autocorrelation are all in the null already.
 *
 * Pure and clock-free; the engine supplies the history and the dates to
 * exclude.
 */

/** A metric's shift is meaningful only if at most this share of placebos moved as far. */
export const METRIC_ALPHA = 0.1;

/**
 * A report earns a headline (and can grade `strong`) only if its most
 * unusual metric is rarer than this among placebo dates, counting every
 * metric tested — the family-wise false-positive rate of the home screen.
 */
export const REPORT_ALPHA = 0.1;

/**
 * Fewest placebo comparisons a null needs before it can calibrate
 * anything. Placebos are one per day, so neighbours overlap heavily; this
 * is a floor against a null built from a single month, not a claim of 30
 * independent trials.
 */
export const MIN_PLACEBOS = 30;

/**
 * Longest step either side of the change that calibration measures. At
 * 30 days this user's ~2.7 years hold about fourteen non-overlapping
 * placebo comparisons; at 90, four or five — and one unlogged level shift
 * then decides the whole null.
 */
export const STEP_WINDOW_DAYS = 30;

export function stepWindowDays(windowDays: number): number {
  return Math.min(windowDays, STEP_WINDOW_DAYS);
}

/** How far back the null reaches — about three years of history. */
export const HISTORY_DAYS = 1095;

export interface PlaceboDraw {
  /** First day of the placebo's after window. */
  pivot: string;
  /** |Cohen's d| of the placebo comparison. */
  absEffect: number;
}

const DAY_MS = 86_400_000;
const toDay = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const fromDay = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/**
 * |d| at every pivot whose two `windowDays` windows both carry enough
 * readings — at least `minPerSide` (the report's own floor), and at least
 * half the days, matching the report's sparse-data threshold. A placebo far sparser than real
 * reports would widen the null and make it lax for no reason.
 *
 * Prefix sums keep each pivot O(log n), so a full history is a few
 * thousand operations per metric.
 */
export function placeboDraws(
  points: { date: string; value: number }[],
  windowDays: number,
  minPerSide: number,
): PlaceboDraw[] {
  if (points.length === 0 || windowDays < 1) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const days = sorted.map((p) => toDay(p.date));
  const sum = [0];
  const sumSq = [0];
  for (const p of sorted) {
    sum.push(sum[sum.length - 1] + p.value);
    sumSq.push(sumSq[sumSq.length - 1] + p.value * p.value);
  }
  // Index of the first reading on or after `day`.
  const lowerBound = (day: number) => {
    let lo = 0;
    let hi = days.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] < day) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const stats = (from: number, to: number) => {
    const i = lowerBound(from);
    const j = lowerBound(to + 1);
    const n = j - i;
    const s = sum[j] - sum[i];
    const mean = n > 0 ? s / n : 0;
    // Sum of squared deviations, floored at zero against rounding.
    const ss = Math.max(0, sumSq[j] - sumSq[i] - n * mean * mean);
    return { n, mean, ss };
  };

  const minReadings = Math.max(minPerSide, Math.ceil(windowDays / 2));
  const first = days[0];
  const last = days[days.length - 1];
  const draws: PlaceboDraw[] = [];
  for (let pivot = first + windowDays; pivot + windowDays - 1 <= last; pivot++) {
    const before = stats(pivot - windowDays, pivot - 1);
    const after = stats(pivot, pivot + windowDays - 1);
    if (before.n < minReadings || after.n < minReadings) continue;
    const pooled = Math.sqrt((before.ss + after.ss) / (before.n + after.n - 2));
    // A flat stretch has no spread; `cohensD` declines it, and so do we —
    // rounding would otherwise turn it into an enormous effect.
    if (!(pooled > 1e-9 * (Math.abs(before.mean) + Math.abs(after.mean) + 1))) continue;
    draws.push({ pivot: fromDay(pivot), absEffect: Math.abs(after.mean - before.mean) / pooled });
  }
  return draws;
}

/**
 * Keeps the clean placebos: those whose comparison span — `windowDays`
 * before the pivot through `windowDays` after — contains no logged
 * boundary. Pass the report's own change among the boundaries: every
 * placebo that straddles it, and so could see the effect under test, is
 * then left out of its own null.
 *
 * A placebo that merely shares days with the report, without straddling
 * its pivot, stays. Both its windows sit on one side of the change, so it
 * measures ordinary variation like any other — and excluding it too cut a
 * hole of four window-lengths around every report, leaving a 90-day null
 * built only from other seasons of the year.
 */
export function excludeDraws(
  draws: PlaceboDraw[],
  windowDays: number,
  boundaries: string[],
): PlaceboDraw[] {
  const marks = boundaries.map(toDay);
  return draws.filter((draw) => {
    const pivot = toDay(draw.pivot);
    const from = pivot - windowDays;
    const to = pivot + windowDays - 1;
    return !marks.some((m) => m >= from && m <= to);
  });
}

/**
 * Share of the null at least as large as `observed`, +1 smoothed: the
 * observed value is itself one draw, so the answer is never zero.
 * `nullSorted` must be ascending.
 */
export function exceedance(nullSorted: number[], observed: number): number {
  return (countAtLeast(nullSorted, observed) + 1) / (nullSorted.length + 1);
}

function countAtLeast(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length - lo;
}

/**
 * Calibrates every metric of one report. `observed` holds each metric's
 * signed Cohen's d over `windowDays` either side of the change; it is
 * ranked by magnitude.
 *
 * `exceedance` ranks each metric against its own null. `adjustedExceedance`
 * then pays for having looked at all of them: it is the share of placebo
 * dates whose MOST unusual metric (smallest exceedance) was at least as
 * unusual as this one — a min-p / Westfall–Young step, which respects the
 * correlation between metrics (six of them come from one sleep record)
 * instead of assuming them independent as Bonferroni would.
 *
 * Each placebo date is ranked exactly as a report pivoting on it would
 * be: against the null without the placebos that straddle it (those
 * within `windowDays`). Neighbouring placebos share most of their days
 * and so most of their |d|; ranking a date against its own neighbours
 * makes every date look ordinary, so the observed report — which never
 * sees its neighbours — looked rarer than it was.
 *
 * Placebo dates for the adjustment are those every calibrated metric was
 * measured on, so a date with two metrics is never compared with one
 * with ten. Only when that intersection is too small does it fall back to
 * every date, taking the minimum over whatever was measured there.
 *
 * Metrics whose null has fewer than {@link MIN_PLACEBOS} draws are left
 * out of the result: too little history to say what "ordinary" is.
 */
export function calibrate(
  observed: Map<string, number>,
  nulls: Map<string, PlaceboDraw[]>,
  windowDays: number,
): Map<string, MetricCalibration> {
  const family = [...observed.keys()].filter((m) => (nulls.get(m)?.length ?? 0) >= MIN_PLACEBOS);
  const sortedNull = new Map(family.map((m) => [
    m,
    (nulls.get(m) ?? []).map((d) => d.absEffect).sort((a, b) => a - b),
  ]));

  const perDate = new Map<string, number[]>();
  for (const metric of family) {
    for (const [pivot, value] of leaveNeighboursOut(nulls.get(metric) ?? [], sortedNull.get(metric)!, windowDays)) {
      const list = perDate.get(pivot) ?? [];
      list.push(value);
      perDate.set(pivot, list);
    }
  }
  const complete = [...perDate.values()].filter((list) => list.length === family.length);
  const dates = complete.length >= MIN_PLACEBOS ? complete : [...perDate.values()];
  const minima = dates.map((list) => Math.min(...list)).sort((a, b) => a - b);

  const out = new Map<string, MetricCalibration>();
  for (const metric of family) {
    const sorted = sortedNull.get(metric)!;
    const own = exceedance(sorted, Math.abs(observed.get(metric)!));
    // Share of placebo dates whose best metric was at least this unusual.
    const atMost = minima.length - countAtLeast(minima, own + 1e-12);
    const adjusted = (atMost + 1) / (minima.length + 1);
    out.set(metric, {
      windowDays,
      effectSize: Math.round(observed.get(metric)! * 100) / 100,
      placebos: sorted.length,
      exceedance: round4(own),
      // Never below the unadjusted value: accounting for more tests cannot
      // make a result more surprising.
      adjustedExceedance: round4(Math.max(own, adjusted)),
    });
  }
  return out;
}

/**
 * Each draw's exceedance against the draws that do not straddle it —
 * those more than `windowDays` away — with the same +1 smoothing as an
 * observed report gets.
 */
function leaveNeighboursOut(
  draws: PlaceboDraw[],
  sorted: number[],
  windowDays: number,
): Map<string, number> {
  const byPivot = [...draws].sort((a, b) => a.pivot.localeCompare(b.pivot));
  const days = byPivot.map((d) => toDay(d.pivot));
  const out = new Map<string, number>();
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < byPivot.length; i++) {
    // A report pivoting on day q drops placebos r with q in [r − L, r + L − 1].
    while (days[lo] < days[i] - windowDays + 1) lo++;
    while (hi < days.length && days[hi] <= days[i] + windowDays) hi++;
    const value = byPivot[i].absEffect;
    let neighboursAtLeast = 0;
    for (let j = lo; j < hi; j++) if (byPivot[j].absEffect >= value) neighboursAtLeast++;
    const others = sorted.length - (hi - lo);
    const atLeast = countAtLeast(sorted, value) - neighboursAtLeast;
    out.set(byPivot[i].pivot, (atLeast + 1) / (others + 1));
  }
  return out;
}

/**
 * Whether a metric carries the evidence a headline or a `strong` grade
 * needs: meaningful on its own AND unusual once every metric in the report
 * is counted. No calibration, no evidence.
 */
export function beatsReportNull(metric: MetricEffect): boolean {
  return (
    metric.meaningful &&
    metric.calibration != null &&
    metric.calibration.adjustedExceedance <= REPORT_ALPHA
  );
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
