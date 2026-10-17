import type {
  ExperimentConfidence,
  ExperimentReport,
  Intervention,
  RecoveryEffectOutcome,
  RecoverySession,
} from "@health-dashboard/shared";
import { ExperimentService } from "../experiments/experimentService.js";
import { pickHeadline } from "../experiments/headline.js";
import { METRIC_SPECS, type DailySeriesSource, type MetricSpec } from "../experiments/metricRegistry.js";
import { daysBetween } from "../experiments/windows.js";
import {
  buildRecoveryEventStudy,
  RECOVERY_EVENT_WINDOW_DAYS,
} from "../analysis/recoveryEventStudyEngine.js";
import type { AlignedRecoveryPeriod } from "../analysis/recoveryEffectEngine.js";
import { addDays } from "../userTz.js";

/**
 * Counterfactual checks for the analysis engines: does an engine claim
 * effects where there are none, and does a real effect peak where it
 * actually happened?
 *
 * - **Placebo changepoints** run the real `ExperimentService` on made-up
 *   interventions dated where nothing was changed. Every "meaningful"
 *   effect it reports there is a false positive, so the rate over many
 *   such dates is the engine's false-positive rate on this person's data —
 *   autocorrelation, seasonality and drift included, which no textbook
 *   threshold accounts for.
 * - **Shifted changepoints** slide a real intervention's date around its
 *   true value. A real step change should produce its largest effect at
 *   (or very near) the true date; a slow drift produces an effect that
 *   grows or shrinks monotonically with the shift and has no peak.
 * - **Placebo event studies** anchor the recovery event study on random
 *   session-free nights, giving the spread of "median deltas" that arises
 *   from nothing at the sample sizes real sessions have.
 *
 * Everything here drives the production engines through their public
 * ports; nothing re-implements their arithmetic. Pure apart from the
 * series source, deterministic (seeded) where it samples.
 */

/** Claims a reader would take at face value: a meaningful effect not graded weak. */
const SOLID: ReadonlySet<ExperimentConfidence> = new Set(["moderate", "strong"]);

/** Placebo ids sit far below any real id so they can never collide. */
const PLACEBO_ID_BASE = -1_000_000;

export interface MetricOutcome {
  effectSize: number | null;
  delta: number;
  meaningful: boolean;
  improved: boolean;
  beforeN: number;
  afterN: number;
}

export interface PlaceboRun {
  date: string;
  /**
   * The engine's own confound scan found no real intervention boundary and
   * no measurement change in either window — the only placebos whose
   * "effects" are unambiguously false. A placebo next to a real change can
   * legitimately pick that change up.
   */
  clean: boolean;
  confidence: ExperimentConfidence;
  confoundKinds: string[];
  headline: string | null;
  metrics: Record<string, MetricOutcome>;
}

/** Every `everyDays`-th date from `from` to `to`, inclusive. */
export function placeboDates(from: string, to: string, everyDays: number): string[] {
  if (everyDays < 1) throw new Error("everyDays must be at least 1");
  const out: string[] = [];
  for (let date = from; date <= to; date = addDays(date, everyDays)) out.push(date);
  return out;
}

/**
 * A made-up intervention with a FIXED window length. Real open-ended
 * interventions get an after window that runs to today (capped at 90
 * days); a placebo must not, or every placebo would measure a different
 * span and the rates would mix window lengths.
 */
export function placeboIntervention(date: string, windowDays: number, index = 0): Intervention {
  return {
    id: PLACEBO_ID_BASE - index,
    kind: "period",
    category: "other",
    name: `Placebo ${date}`,
    startedOn: date,
    endedOn: addDays(date, windowDays - 1),
    source: "manual",
    sourceRef: null,
    detail: null,
    createdAt: date,
    updatedAt: date,
  };
}

function outcomes(report: ExperimentReport): Record<string, MetricOutcome> {
  return Object.fromEntries(report.metrics.map((m) => [m.metric, {
    effectSize: m.effectSize,
    delta: m.delta,
    meaningful: m.meaningful,
    improved: m.improved,
    beforeN: m.before.n,
    afterN: m.after.n,
  }]));
}

/**
 * Runs one report for `subject` with `others` as the rest of the store, so
 * the confound scan sees the real history exactly as production does.
 */
async function reportWith(
  series: DailySeriesSource,
  subject: Intervention,
  others: Intervention[],
  today: string,
  specs: MetricSpec[],
): Promise<ExperimentReport> {
  const all = [...others.filter((o) => o.id !== subject.id), subject];
  const service = new ExperimentService(
    {
      findById: async (id) => all.find((i) => i.id === id) ?? null,
      findAll: async () => all,
    },
    series,
    specs,
  );
  return service.report(subject.id, today);
}

export interface PlaceboOptions {
  series: DailySeriesSource;
  /** The real intervention store, so placebo reports carry real confounds. */
  realInterventions: Intervention[];
  dates: string[];
  windowDays: number;
  today: string;
  specs?: MetricSpec[];
}

export async function runPlacebos(options: PlaceboOptions): Promise<PlaceboRun[]> {
  const specs = options.specs ?? METRIC_SPECS;
  const runs: PlaceboRun[] = [];
  for (const [index, date] of options.dates.entries()) {
    // A placebo whose after window is not over yet would be measured on a
    // shorter span than the others.
    if (addDays(date, options.windowDays - 1) >= options.today) continue;
    const subject = placeboIntervention(date, options.windowDays, index);
    const report = await reportWith(options.series, subject, options.realInterventions, options.today, specs);
    const kinds = report.confounds.map((c) => c.kind);
    runs.push({
      date,
      clean: !kinds.includes("nearby_intervention") && !kinds.includes("measurement_change"),
      confidence: report.confidence,
      confoundKinds: [...new Set(kinds)],
      headline: pickHeadline(report.metrics)?.metric ?? null,
      metrics: outcomes(report),
    });
  }
  return runs;
}

export interface PlaceboMetricRate {
  metric: string;
  /** Placebos where this metric had enough readings to be judged. */
  judged: number;
  /** Share of judged placebos flagging this metric `meaningful`. */
  meaningfulRate: number;
  /** …and with the report graded moderate or strong. */
  solidRate: number;
  /** |Cohen's d| the engine reported, sorted ascending — the null distribution. */
  nullAbsEffect: number[];
}

export interface PlaceboSummary {
  runs: number;
  /** Runs graded better than `insufficient`. */
  usable: number;
  /** Usable runs that would put a headline on the home screen. */
  headlineRate: number;
  /** Usable runs with a headline AND moderate/strong confidence. */
  solidHeadlineRate: number;
  confidence: Record<ExperimentConfidence, number>;
  perMetric: PlaceboMetricRate[];
}

export function summarizePlacebos(runs: PlaceboRun[], specs: MetricSpec[] = METRIC_SPECS): PlaceboSummary {
  const usable = runs.filter((r) => r.confidence !== "insufficient");
  const confidence: Record<ExperimentConfidence, number> = { insufficient: 0, weak: 0, moderate: 0, strong: 0 };
  for (const run of runs) confidence[run.confidence] += 1;

  const perMetric = specs.map((spec): PlaceboMetricRate => {
    const judged = usable.flatMap((run) => {
      const outcome = run.metrics[spec.key];
      return outcome && outcome.beforeN >= 5 && outcome.afterN >= 5 ? [{ run, outcome }] : [];
    });
    const meaningful = judged.filter(({ outcome }) => outcome.meaningful);
    return {
      metric: spec.key,
      judged: judged.length,
      meaningfulRate: rate(meaningful.length, judged.length),
      solidRate: rate(meaningful.filter(({ run }) => SOLID.has(run.confidence)).length, judged.length),
      nullAbsEffect: judged
        .flatMap(({ outcome }) => outcome.effectSize == null ? [] : [Math.abs(outcome.effectSize)])
        .sort((a, b) => a - b),
    };
  });

  const withHeadline = usable.filter((r) => r.headline != null);
  return {
    runs: runs.length,
    usable: usable.length,
    headlineRate: rate(withHeadline.length, usable.length),
    solidHeadlineRate: rate(withHeadline.filter((r) => SOLID.has(r.confidence)).length, usable.length),
    confidence,
    perMetric,
  };
}

/**
 * Share of the null distribution at least as large as `observed` — an
 * empirical, autocorrelation-honest p-value analogue. Small means the
 * observed effect is rare among placebos.
 */
export function placeboExceedance(nullSorted: number[], observed: number): number | null {
  if (nullSorted.length === 0) return null;
  const atLeast = nullSorted.filter((value) => value >= observed).length;
  // +1 smoothing: the observed value is itself one draw, so never report 0.
  return (atLeast + 1) / (nullSorted.length + 1);
}

/** The value below which `q` of the sorted values fall (nearest rank). */
export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

export interface ShiftRow {
  offset: number;
  startedOn: string;
  confidence: ExperimentConfidence;
  metrics: Record<string, MetricOutcome>;
}

export interface ShiftOptions {
  series: DailySeriesSource;
  intervention: Intervention;
  others: Intervention[];
  offsets: number[];
  /** Fixed window length, so every shift measures the same span. */
  windowDays: number;
  today: string;
  specs?: MetricSpec[];
}

/**
 * Re-runs the report with the intervention's date moved by each offset.
 * The intervention keeps its id, so it is never scanned as its own
 * confound; every other intervention stays where it really was.
 */
export async function runShifted(options: ShiftOptions): Promise<ShiftRow[]> {
  const specs = options.specs ?? METRIC_SPECS;
  const rows: ShiftRow[] = [];
  for (const offset of options.offsets) {
    const startedOn = addDays(options.intervention.startedOn, offset);
    if (addDays(startedOn, options.windowDays - 1) >= options.today) continue;
    const shifted: Intervention = {
      ...options.intervention,
      kind: "period",
      startedOn,
      endedOn: addDays(startedOn, options.windowDays - 1),
    };
    const report = await reportWith(options.series, shifted, options.others, options.today, specs);
    rows.push({ offset, startedOn, confidence: report.confidence, metrics: outcomes(report) });
  }
  return rows;
}

/**
 * The offset at which a metric's effect is largest in magnitude. Null when
 * no shift produced an effect size for it.
 */
export function peakOffset(rows: ShiftRow[], metric: string): number | null {
  let best: { offset: number; size: number } | null = null;
  for (const row of rows) {
    const d = row.metrics[metric]?.effectSize;
    if (d == null) continue;
    if (best == null || Math.abs(d) > best.size) best = { offset: row.offset, size: Math.abs(d) };
  }
  return best?.offset ?? null;
}

// --- Recovery event study ------------------------------------------------

/** Deterministic PRNG (mulberry32) seeded from a string. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export const PLACEBO_ACTIVITY_ID = -1;

function placeboSession(period: AlignedRecoveryPeriod, index: number): RecoverySession {
  // Thirty minutes ending two hours before the night it is attached to.
  const startedAt = new Date(Date.parse(period.sleepStartAt) - 150 * 60_000).toISOString();
  return {
    id: PLACEBO_ID_BASE - index,
    activityId: PLACEBO_ACTIVITY_ID,
    activityCode: "placebo",
    activityName: "Placebo",
    activityCategory: "other",
    startedAt,
    durationMinutes: 30,
    intensity: null,
    temperatureF: null,
    massageType: null,
    notes: null,
    source: "manual",
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

/** Nights a placebo session can sit on: no session within the event window. */
export function placeboAnchorCandidates(periods: AlignedRecoveryPeriod[]): string[] {
  const sessionDates = periods.filter((p) => p.sessions.length > 0).map((p) => p.date);
  return periods
    .filter((p) => p.sessions.length === 0)
    .filter((p) => sessionDates.every((d) => Math.abs(daysBetween(d, p.date)) > RECOVERY_EVENT_WINDOW_DAYS))
    .map((p) => p.date);
}

/** Runs the real event study with fake sessions placed on `anchors`. */
export function placeboEventStudy(
  periods: AlignedRecoveryPeriod[],
  anchors: string[],
  outcome: RecoveryEffectOutcome,
) {
  const anchorSet = new Set(anchors);
  let index = 0;
  const withPlacebos = periods.map((period) =>
    anchorSet.has(period.date)
      ? { ...period, sessions: [...period.sessions, placeboSession(period, index++)] }
      : period,
  );
  return buildRecoveryEventStudy(withPlacebos, PLACEBO_ACTIVITY_ID, outcome, 0);
}

export interface EventStudyNullOptions {
  outcome: RecoveryEffectOutcome;
  eventsPerDraw: number;
  draws: number;
  seed: string;
  /** Placebo anchors in one draw are at least this far apart. */
  minSpacingDays?: number;
  /**
   * Adds `delta` to the outcome `offsetDays` after every placebo anchor —
   * a known, planted effect, so the draws measure whether the study can
   * recover it (power) instead of what chance looks like.
   */
  plant?: { offsetDays: number; delta: number };
}

const OUTCOME_FIELD: Record<RecoveryEffectOutcome, keyof AlignedRecoveryPeriod["outcomes"]> = {
  sleep_duration: "sleepDuration",
  sleep_efficiency: "sleepEfficiency",
  resting_heart_rate: "restingHeartRate",
  hrv: "hrv",
  restlessness: "restlessness",
  readiness: "readiness",
};

function plantEffect(
  periods: AlignedRecoveryPeriod[],
  anchors: string[],
  outcome: RecoveryEffectOutcome,
  plant: { offsetDays: number; delta: number },
): AlignedRecoveryPeriod[] {
  const targets = new Set(anchors.map((a) => addDays(a, plant.offsetDays)));
  const field = OUTCOME_FIELD[outcome];
  return periods.map((period) => {
    const value = period.outcomes[field];
    if (!targets.has(period.date) || value == null) return period;
    return { ...period, outcomes: { ...period.outcomes, [field]: value + plant.delta } };
  });
}

function drawAnchors(candidates: string[], count: number, spacing: number, random: () => number): string[] | null {
  const pool = [...candidates];
  const chosen: string[] = [];
  while (chosen.length < count && pool.length > 0) {
    const [date] = pool.splice(Math.floor(random() * pool.length), 1);
    if (chosen.every((c) => Math.abs(daysBetween(c, date)) >= spacing)) chosen.push(date);
  }
  return chosen.length < count ? null : chosen;
}

/** One aggregate per draw: the raw material for null bands and power. */
function eventStudyDraws(
  periods: AlignedRecoveryPeriod[],
  options: EventStudyNullOptions,
): Map<number, number[]> {
  const spacing = options.minSpacingDays ?? RECOVERY_EVENT_WINDOW_DAYS * 2 + 1;
  const candidates = placeboAnchorCandidates(periods);
  const random = seededRandom(options.seed);
  const byOffset = new Map<number, number[]>();
  for (let draw = 0; draw < options.draws; draw++) {
    const chosen = drawAnchors(candidates, options.eventsPerDraw, spacing, random);
    if (chosen == null) continue;
    const input = options.plant ? plantEffect(periods, chosen, options.outcome, options.plant) : periods;
    for (const point of placeboEventStudy(input, chosen, options.outcome).aggregate) {
      const list = byOffset.get(point.offsetDays) ?? [];
      list.push(point.medianDelta);
      byOffset.set(point.offsetDays, list);
    }
  }
  return byOffset;
}

export interface EventStudyNullPoint {
  offsetDays: number;
  draws: number;
  /** |median delta| quantiles across draws — what "nothing" looks like. */
  absMedianDeltaP50: number | null;
  absMedianDeltaP90: number | null;
  absMedianDeltaP95: number | null;
}

/**
 * The spread of the event study's aggregate median delta when the "events"
 * are random session-free nights. A real aggregate inside this band is
 * indistinguishable from nothing at that sample size.
 */
export function eventStudyNull(
  periods: AlignedRecoveryPeriod[],
  options: EventStudyNullOptions,
): EventStudyNullPoint[] {
  return [...eventStudyDraws(periods, { ...options, plant: undefined }).entries()]
    .sort(([a], [b]) => a - b)
    .map(([offsetDays, values]) => {
      const sorted = values.map(Math.abs).sort((a, b) => a - b);
      return {
        offsetDays,
        draws: sorted.length,
        absMedianDeltaP50: quantile(sorted, 0.5),
        absMedianDeltaP90: quantile(sorted, 0.9),
        absMedianDeltaP95: quantile(sorted, 0.95),
      };
    });
}

export interface EventStudyPower {
  draws: number;
  /** Median of the recovered median deltas at the planted offset. */
  recoveredMedian: number | null;
  /** Share of draws whose |median delta| beat `threshold` in the planted direction. */
  power: number;
}

/**
 * Plants a known effect on random session-free nights and reports how
 * often the event study's aggregate recovers it beyond `threshold`
 * (typically the null band's p95 at the same event count).
 */
export function eventStudyPower(
  periods: AlignedRecoveryPeriod[],
  options: EventStudyNullOptions & { plant: { offsetDays: number; delta: number }; threshold: number },
): EventStudyPower {
  const recovered = eventStudyDraws(periods, options).get(options.plant.offsetDays) ?? [];
  const sign = Math.sign(options.plant.delta) || 1;
  const hits = recovered.filter((value) => value * sign > options.threshold).length;
  const sorted = [...recovered].sort((a, b) => a - b);
  return {
    draws: recovered.length,
    recoveredMedian: quantile(sorted, 0.5),
    power: rate(hits, recovered.length),
  };
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
