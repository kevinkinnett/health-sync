import type {
  Confound,
  ExperimentConfidence,
  Intervention,
  MetricEffect,
} from "@health-dashboard/shared";
import { daysBetween, type WindowPair } from "./windows.js";

/**
 * Finds the reasons a before/after result might not mean what it appears
 * to mean, and grades how much weight the whole report deserves.
 *
 * This is the part that makes the feature trustworthy rather than
 * merely impressive. The motivating case is real: the Eight Sleep arrived
 * on 2 May and the escitalopram dose was halved on 8 May — six days
 * apart. Any naive before/after would credit the mattress for both, and
 * SSRIs are known to suppress REM, so the REM jump had a second entirely
 * plausible author. A report that cannot say that out loud is worse than
 * no report.
 */

/**
 * Dates on which HOW something is measured changed, independently of the
 * user's behaviour. A shift here can manufacture an effect out of nothing.
 *
 * Kept as a constant rather than data because these are facts about this
 * app's own ingest history. If the list grows, it should become a table.
 */
const MEASUREMENT_CHANGES: { date: string; detail: string; affectedMetrics: string[] }[] = [
  {
    date: "2026-06-12",
    detail:
      "Google Health cutover — sleep efficiency became a derived value " +
      "rather than one Fitbit supplied, and HRV changed to a per-5-minute " +
      "flavour with a different absolute scale. Activity rollups also moved " +
      "to the Google Health ingest path.",
    affectedMetrics: [
      "sleepMin", "inBedMin", "efficiency", "wakeMin", "deepMin", "remMin",
      "dailyRmssd", "steps", "activeMinutes",
    ],
  },
];

/** A change this close to the pivot is essentially inseparable from it. */
const INSEPARABLE_DAYS = 14;

/** Below this, a window is too short to say much. */
const SHORT_WINDOW_DAYS = 14;

/** Below this fraction of days carrying a reading, coverage is poor. */
const SPARSE_COVERAGE = 0.5;

export function scanConfounds(
  subject: Intervention,
  others: Intervention[],
  windows: WindowPair,
  coverage: { before: number; after: number },
  measuredMetrics?: string[],
): Confound[] {
  const found: Confound[] = [];
  const pivot = subject.startedOn;

  // --- Other interventions that could be doing the work ------------------
  for (const other of others) {
    if (other.id === subject.id) continue;

    // Any boundary of the other intervention that lands inside either
    // window is a candidate explanation.
    const boundaries = [other.startedOn, other.endedOn].filter(
      (d): d is string => d != null,
    );
    for (const boundary of boundaries) {
      const inWindow =
        boundary >= windows.before.start && boundary <= windows.after.end;
      if (!inWindow) continue;

      const gap = Math.abs(daysBetween(pivot, boundary));
      const verb = boundary === other.startedOn ? "started" : "ended";
      found.push({
        kind: "nearby_intervention",
        severity: gap <= INSEPARABLE_DAYS ? "high" : "medium",
        date: boundary,
        detail:
          gap <= INSEPARABLE_DAYS
            ? `"${other.name}" ${verb} ${gap} day${gap === 1 ? "" : "s"} from this change — too close to separate the two. Any effect here could belong to either.`
            : `"${other.name}" ${verb} inside the comparison window, ${gap} days from the pivot. It may account for part of the difference.`,
      });
    }
  }

  // --- Changes in how the metric was measured ---------------------------
  for (const change of MEASUREMENT_CHANGES) {
    if (
      measuredMetrics != null &&
      !change.affectedMetrics.some((metric) => measuredMetrics.includes(metric))
    ) continue;
    const inWindow =
      change.date >= windows.before.start && change.date <= windows.after.end;
    if (!inWindow) continue;
    // Straddling the pivot is worse than sitting on one side, because it
    // maps directly onto the before/after split.
    const straddles =
      change.date > windows.before.start && change.date < windows.after.end;
    found.push({
      kind: "measurement_change",
      severity: straddles ? "high" : "medium",
      date: change.date,
      detail: `${change.detail} A measurement change inside the window can produce an apparent effect on its own.`,
    });
  }

  // --- Window shape -----------------------------------------------------
  if (windows.after.days < SHORT_WINDOW_DAYS) {
    found.push({
      kind: "short_window",
      severity: windows.after.days < 7 ? "high" : "medium",
      detail: `Only ${windows.after.days} day${windows.after.days === 1 ? "" : "s"} since the change — too early to distinguish an effect from ordinary day-to-day swing.`,
    });
  }

  for (const [side, ratio] of [
    ["before", coverage.before],
    ["after", coverage.after],
  ] as const) {
    if (ratio < SPARSE_COVERAGE) {
      found.push({
        kind: "sparse_data",
        severity: ratio < 0.25 ? "high" : "medium",
        detail: `Only ${Math.round(ratio * 100)}% of days in the ${side} window carried a reading, so its average rests on relatively few nights.`,
      });
    }
  }

  return found;
}

/**
 * Grades the report. A single high-severity confound caps confidence at
 * `weak` no matter how clean the numbers look — the point of the grade is
 * to stop a tidy-looking table from over-persuading.
 */
export function gradeConfidence(
  metrics: MetricEffect[],
  confounds: Confound[],
  windows: WindowPair,
): ExperimentConfidence {
  const usable = metrics.filter((m) => m.before.n >= 5 && m.after.n >= 5);
  if (usable.length === 0) return "insufficient";

  if (confounds.some((c) => c.severity === "high")) return "weak";

  const longEnough = windows.before.days >= 30 && windows.after.days >= 30;
  const clean = confounds.length === 0;
  if (longEnough && clean) return "strong";
  return "moderate";
}
