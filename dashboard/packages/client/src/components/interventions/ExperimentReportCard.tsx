import type {
  Confound,
  ExperimentConfidence,
  ExperimentReport,
  MetricEffect,
} from "@health-dashboard/shared";
import { useExperimentReport } from "../../api/queries";
import { QueryBoundary } from "../QueryBoundary";
import { SERIES, STATUS } from "../charts/chartPalette";

/**
 * The "did it work?" report.
 *
 * The design job here is restraint: the engine is careful about what it
 * will and won't claim, and a UI that renders a tidy grid of green arrows
 * would undo that. So confidence sits at the top rather than the bottom,
 * confounds are given equal billing with the numbers, and a metric that
 * moved without being meaningful is shown greyed rather than coloured.
 */

const CONFIDENCE: Record<
  ExperimentConfidence,
  { label: string; color: string; blurb: string }
> = {
  strong: {
    label: "Strong evidence",
    color: STATUS.good,
    blurb: "Long windows on both sides, dense data, nothing else competing.",
  },
  moderate: {
    label: "Moderate evidence",
    color: SERIES[0],
    blurb: "Usable, but read the caveats below before acting on it.",
  },
  weak: {
    label: "Weak evidence",
    color: STATUS.warning,
    blurb: "Something else could be producing this. Treat it as a hint.",
  },
  insufficient: {
    label: "Not enough data",
    color: STATUS.critical,
    blurb: "Too few readings around this change to say anything yet.",
  },
};

const SEVERITY_COLOR: Record<Confound["severity"], string> = {
  high: STATUS.critical,
  medium: STATUS.warning,
  low: SERIES[0],
};

export function ExperimentReportCard({
  interventionId,
}: {
  interventionId: number;
}) {
  const q = useExperimentReport(interventionId);
  return (
    <QueryBoundary query={q}>{(report) => <Report report={report} />}</QueryBoundary>
  );
}

function Report({ report }: { report: ExperimentReport }) {
  const conf = CONFIDENCE[report.confidence];

  return (
    <div className="bg-surface-container rounded-xl p-5 space-y-5 border border-outline-variant/10">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold"
            style={{ color: conf.color, backgroundColor: `${conf.color}22` }}
          >
            {conf.label}
          </span>
          <span className="text-[11px] text-outline tabular-nums">
            {report.before.start} – {report.before.end} vs {report.after.start} –{" "}
            {report.after.end}
          </span>
        </div>
        <h3 className="text-base font-semibold text-on-surface mt-3">
          {report.summary}
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">{conf.blurb}</p>
      </div>

      {report.metrics.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-outline">
                <th className="text-left font-medium py-2">Metric</th>
                <th className="text-right font-medium py-2">Before</th>
                <th className="text-right font-medium py-2">After</th>
                <th className="text-right font-medium py-2">Change</th>
                <th className="text-right font-medium py-2" title="Cohen's d — the shift relative to this metric's own variability">
                  Effect
                </th>
              </tr>
            </thead>
            <tbody>
              {report.metrics.map((m) => (
                <MetricRow key={m.metric} effect={m} />
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-outline mt-3">
            No p-values: daily health metrics are strongly autocorrelated, so a
            significance test would read as far more decisive than the evidence
            supports. Effect size and sample counts are shown instead.
          </p>
        </div>
      )}

      {report.confounds.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-outline mb-2">
            What else could explain this
          </p>
          <ul className="space-y-2">
            {report.confounds.map((c, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <span
                  className="material-symbols-outlined text-sm mt-0.5 shrink-0"
                  style={{ color: SEVERITY_COLOR[c.severity] }}
                  aria-hidden="true"
                >
                  {c.severity === "high" ? "priority_high" : "info"}
                </span>
                <span className="text-xs text-on-surface-variant">
                  {c.detail}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MetricRow({ effect: m }: { effect: MetricEffect }) {
  // Only a meaningful move earns colour. A change that is real but small
  // stays in muted ink so the eye isn't drawn to noise.
  const color = !m.meaningful
    ? undefined
    : m.improved
      ? STATUS.good
      : STATUS.critical;
  const arrow = m.direction === "flat" ? "" : m.direction === "up" ? "▲" : "▼";

  return (
    <tr className="border-t border-outline-variant/10">
      <td className="py-2.5 text-on-surface">
        {m.label}
        <span className="text-outline text-[11px]"> ({m.unit})</span>
      </td>
      <td className="py-2.5 text-right tabular-nums text-on-surface-variant">
        {m.before.mean}
        <span className="text-outline text-[10px]"> n={m.before.n}</span>
      </td>
      <td className="py-2.5 text-right tabular-nums text-on-surface-variant">
        {m.after.mean}
        <span className="text-outline text-[10px]"> n={m.after.n}</span>
      </td>
      <td
        className="py-2.5 text-right tabular-nums font-medium"
        style={{ color }}
      >
        {arrow} {m.delta > 0 ? "+" : ""}
        {m.delta}
        {m.deltaPct != null && (
          <span className="text-outline text-[10px]">
            {" "}
            ({m.deltaPct > 0 ? "+" : ""}
            {m.deltaPct}%)
          </span>
        )}
      </td>
      <td className="py-2.5 text-right tabular-nums text-on-surface-variant">
        {m.effectSize ?? "—"}
      </td>
    </tr>
  );
}
