import type {
  ExperimentConfidence,
  ExperimentReport,
  ExperimentSummary,
  MetricEffect,
} from "@health-dashboard/shared";

/**
 * Reduces full reports to what a home screen can show, and decides which
 * ones are worth the space.
 *
 * Kept apart from `ExperimentService` because it is a presentation policy,
 * not analysis: "which of these four answers do I lead with" is a
 * different question from "what happened after this date", and only one of
 * them has a right answer in the data. Separating them means the ranking
 * can be argued with and re-tested without touching the engine.
 */

/** Worst to best, so a higher index is a better-supported answer. */
const CONFIDENCE_RANK: Record<ExperimentConfidence, number> = {
  insufficient: 0,
  weak: 1,
  moderate: 2,
  strong: 3,
};

/**
 * The single move a person would quote.
 *
 * Ranks by |Cohen's d| rather than by raw delta or percentage: the units
 * are not comparable across metrics (minutes of sleep against bpm against
 * a 0-100 efficiency), and effect size is the one scale on which they are.
 * A metric that shifted a long way on a very noisy series is not the
 * headline; one that shifted clearly against its own spread is.
 *
 * Only `meaningful` effects qualify. Without that filter the headline
 * would always be whichever metric happened to wobble most, and the card
 * would claim a result on every intervention ever entered.
 */
export function pickHeadline(metrics: MetricEffect[]): MetricEffect | null {
  const candidates = metrics.filter(
    (m) => m.meaningful && m.effectSize != null,
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, m) =>
    Math.abs(m.effectSize as number) > Math.abs(best.effectSize as number)
      ? m
      : best,
  );
}

export function toSummary(report: ExperimentReport): ExperimentSummary {
  return {
    interventionId: report.interventionId,
    interventionName: report.interventionName,
    interventionCategory: report.interventionCategory,
    evidence: report.evidence,
    changepoint: report.changepoint,
    confidence: report.confidence,
    summary: report.summary,
    headline: pickHeadline(report.metrics),
  };
}

/**
 * Orders summaries for display and drops the ones with nothing to say.
 *
 * `insufficient` reports are excluded outright — "not enough data yet" is
 * true of every intervention entered this week, and a home screen full of
 * it teaches the reader to ignore the card.
 *
 * Among the rest, an answer that HAS a headline outranks one that does
 * not, because "nothing moved" is a weaker draw than "sleep efficiency
 * +11". Then better-supported answers first, then the most recent
 * changepoint, so the ordering is stable and never depends on the order
 * the store happened to return.
 */
export function rankSummaries(
  summaries: ExperimentSummary[],
): ExperimentSummary[] {
  return summaries
    .filter((s) => s.confidence !== "insufficient")
    .sort((a, b) => {
      const hasHeadline = Number(b.headline != null) - Number(a.headline != null);
      if (hasHeadline !== 0) return hasHeadline;

      const byConfidence =
        CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
      if (byConfidence !== 0) return byConfidence;

      return b.changepoint.localeCompare(a.changepoint);
    });
}
