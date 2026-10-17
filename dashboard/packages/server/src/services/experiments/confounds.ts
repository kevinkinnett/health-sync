import type {
  Confound,
  ExperimentConfidence,
  Intervention,
  MetricEffect,
} from "@health-dashboard/shared";
import { beatsReportNull } from "./calibration.js";
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
 * user's behaviour. A shift here can manufacture an effect out of nothing,
 * so it is flagged as a confound and kept out of the placebo null.
 *
 * Kept as a constant rather than data because these are facts about this
 * app's own ingest history. If the list grows, it should become a table.
 *
 * Retired: the 2026-06-12 Google Health cutover. The whole sleep and HRV
 * history has since been re-ingested through Google Health (every sleep
 * row is `main_sleep_v2`, every HRV row `daily_hrv_v1`, back to 2024-01),
 * and no metric steps at that date. The stale flag capped three of four
 * real reports at `weak`. It was also the only thing hiding a drift-driven
 * strength-training HRV headline, so it came out only once headlines had
 * to beat the placebo null (docs/insight-quality-2026-10.md).
 */
export const MEASUREMENT_CHANGES: { date: string; detail: string; affectedMetrics: string[] }[] = [];

/**
 * Fewest readings a side needs before a metric can carry a verdict — both
 * for the report as a whole and for any single metric the summary or the
 * home-screen headline quotes. Cohen's d is computable from two points,
 * but two nights is not evidence.
 */
export const MIN_READINGS_PER_SIDE = 5;

/** A change this close to the pivot is essentially inseparable from it. */
const INSEPARABLE_DAYS = 14;

/**
 * Longest gap between one derived dose run's last logged day and the next
 * run's first that still counts as a single dose change. Matches the dose
 * deriver's grace for a regimen that is still running: a longer silence
 * means the medication was stopped and restarted, which is a change of its
 * own worth flagging.
 */
const DOSE_HANDOFF_DAYS = 10;

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
  const handoff = doseHandoffs(subject, others);
  for (const key of thirdPartyHandoffs(subject, others, windows)) handoff.add(key);
  for (const other of others) {
    if (other.id === subject.id) continue;

    // Any boundary of the other intervention that lands inside either
    // window is a candidate explanation — except the one where the same
    // medication handed over to this dose, which IS the change under study.
    const boundaries = [other.startedOn, other.endedOn].filter(
      (d): d is string => d != null && !handoff.has(`${other.id}:${d}`),
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

/** `medication.item:7:dose:20:2026-03-01` → `medication.item:7`. */
function doseItem(intervention: Intervention): string | null {
  const match = /^(medication\.item:\d+):dose:/.exec(intervention.sourceRef ?? "");
  return match ? match[1] : null;
}

/**
 * The boundaries (`<id>:<date>`) at which another run of the SAME derived
 * medication hands over to or from the subject.
 *
 * The dose deriver writes 20 mg → 10 mg as two adjacent interventions, so
 * without this the 20 mg run ending the day before would be reported as a
 * rival explanation for the 10 mg change — the same change seen from the
 * other side — and cap every dose-change report at `weak`. Only the
 * immediate neighbours are excused; an earlier dose change of the same
 * drug inside the window is still a real confound.
 */
function doseHandoffs(subject: Intervention, others: Intervention[]): Set<string> {
  const item = doseItem(subject);
  const excused = new Set<string>();
  if (item == null) return excused;

  const siblings = others.filter((o) => o.id !== subject.id && doseItem(o) === item);
  const previous = siblings
    .filter((o) => o.endedOn != null && o.endedOn < subject.startedOn)
    .sort((a, b) => (b.endedOn as string).localeCompare(a.endedOn as string))[0];
  if (previous && daysBetween(previous.endedOn as string, subject.startedOn) <= DOSE_HANDOFF_DAYS) {
    excused.add(`${previous.id}:${previous.endedOn}`);
  }

  if (subject.endedOn != null) {
    const end = subject.endedOn;
    const next = siblings
      .filter((o) => o.startedOn > end)
      .sort((a, b) => a.startedOn.localeCompare(b.startedOn))[0];
    if (next && daysBetween(end, next.startedOn) <= DOSE_HANDOFF_DAYS) {
      excused.add(`${next.id}:${next.startedOn}`);
    }
  }
  return excused;
}

/**
 * Old-dose end boundaries (`<id>:<date>`) to drop when a report about
 * something ELSE sees a dose change of one medication.
 *
 * 20 mg ending on 4 May and 10 mg starting on 8 May are one change seen
 * twice, so the mattress report listed it as two HIGH rivals. Only the new
 * dose's start is kept — and only when that start is itself inside the
 * windows, so the change is never dropped altogether.
 */
function thirdPartyHandoffs(
  subject: Intervention,
  others: Intervention[],
  windows: WindowPair,
): Set<string> {
  const subjectItem = doseItem(subject);
  const runs = others.filter((o) => o.id !== subject.id && doseItem(o) != null && doseItem(o) !== subjectItem);
  const dropped = new Set<string>();
  for (const run of runs) {
    if (run.endedOn == null) continue;
    const end = run.endedOn;
    const next = runs
      .filter((o) => doseItem(o) === doseItem(run) && o.startedOn > end)
      .sort((a, b) => a.startedOn.localeCompare(b.startedOn))[0];
    if (
      next &&
      daysBetween(end, next.startedOn) <= DOSE_HANDOFF_DAYS &&
      next.startedOn >= windows.before.start &&
      next.startedOn <= windows.after.end
    ) {
      dropped.add(`${run.id}:${end}`);
    }
  }
  return dropped;
}

/**
 * Grades the report. A single high-severity confound caps confidence at
 * `weak` no matter how clean the numbers look — the point of the grade is
 * to stop a tidy-looking table from over-persuading.
 *
 * `strong` also needs evidence, not just the absence of a problem: some
 * metric has to beat this person's own placebo null with every metric
 * counted. Without that, a clean design over ordinary drift graded every
 * placebo date `strong`.
 */
export function gradeConfidence(
  metrics: MetricEffect[],
  confounds: Confound[],
  windows: WindowPair,
): ExperimentConfidence {
  const usable = metrics.filter((m) => m.before.n >= MIN_READINGS_PER_SIDE && m.after.n >= MIN_READINGS_PER_SIDE);
  if (usable.length === 0) return "insufficient";

  if (confounds.some((c) => c.severity === "high")) return "weak";

  const longEnough = windows.before.days >= 30 && windows.after.days >= 30;
  const clean = confounds.length === 0;
  const evidenced = usable.some(beatsReportNull);
  if (longEnough && clean && evidenced) return "strong";
  return "moderate";
}
