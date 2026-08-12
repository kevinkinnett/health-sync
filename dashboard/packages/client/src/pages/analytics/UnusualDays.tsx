import type {
  RecoveryAnomalyDay,
  RecoveryAnomalyReport,
  RecoveryFeature,
} from "@health-dashboard/shared";
import { useRecoveryAnomalies } from "../../api/queries";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";

const directionStyle = {
  worse: "border-error/25 bg-error/10 text-error",
  better: "border-secondary/25 bg-secondary/10 text-secondary",
  mixed: "border-tertiary/25 bg-tertiary/10 text-tertiary",
} as const;

const impactStyle = {
  worse: "text-error",
  better: "text-secondary",
  neutral: "text-on-surface-variant",
} as const;

export function AnalyticsUnusualDays() {
  const query = useRecoveryAnomalies();
  return (
    <QueryBoundary query={query}>
      {(report) => <UnusualDaysReport report={report} />}
    </QueryBoundary>
  );
}

function UnusualDaysReport({ report }: { report: RecoveryAnomalyReport }) {
  const strong = report.unusualDays.filter((day) => day.severity === "strong").length;
  const adverse = report.unusualDays.filter((day) => day.direction === "worse").length;
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-outline-variant/15 bg-surface-container p-5">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-secondary/20 bg-secondary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-secondary">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">bolt</span>
          Computed live
        </div>
        <p className="text-sm text-on-surface-variant max-w-3xl">
          Each completed wake date is compared with its own {report.baselineWindowDays}-day,
          weekday-aware baseline. Sensors retain separate measurement regimes before their
          standardized trends are combined, so a provider cutover cannot manufacture an event.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryValue label="Days analyzed" value={report.daysAnalyzed} />
          <SummaryValue label="Unusual days" value={report.unusualDays.length} />
          <SummaryValue label="Strong / adverse" value={`${strong} / ${adverse}`} />
        </div>
      </div>

      {report.unusualDays.length === 0 ? (
        <EmptyState
          icon="check_circle"
          message="No completed days in this window crossed the unusualness threshold."
        />
      ) : (
        <div className="space-y-3">
          {report.unusualDays.map((day) => <AnomalyCard key={day.date} day={day} />)}
        </div>
      )}

      <div className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-outline">How to read this</h3>
        <ul className="mt-2 space-y-1 text-xs text-on-surface-variant">
          {report.caveats.map((caveat) => <li key={caveat}>• {caveat}</li>)}
        </ul>
      </div>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-surface-container-high px-4 py-3">
      <div className="text-2xl font-bold tabular-nums text-on-surface">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-outline">{label}</div>
    </div>
  );
}

function AnomalyCard({ day }: { day: RecoveryAnomalyDay }) {
  const leaders = day.features.filter((feature) => feature.impact !== "neutral").slice(0, 3);
  return (
    <details className="group rounded-2xl border border-outline-variant/15 bg-surface-container overflow-hidden">
      <summary className="cursor-pointer list-none p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-headline font-bold tabular-nums text-on-surface">{day.date}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${directionStyle[day.direction]}`}>
                {day.direction}
              </span>
              <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                {day.severity}
              </span>
            </div>
            <p className="mt-2 text-sm text-on-surface-variant">{day.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {leaders.map((feature) => (
                <span key={feature.metric} className={`text-xs font-semibold ${impactStyle[feature.impact]}`}>
                  {feature.label} {formatSigma(feature.recoveryZ)}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <div className="text-2xl font-bold tabular-nums text-on-surface">{day.score}</div>
              <div className="text-[10px] uppercase tracking-widest text-outline">unusualness</div>
            </div>
            <span className="material-symbols-outlined text-outline transition-transform group-open:rotate-180">expand_more</span>
          </div>
        </div>
      </summary>

      <div className="border-t border-outline-variant/10 px-5 pb-5 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-outline">
          <span>{day.coveragePct}% configured signal coverage</span>
          <span>Positive σ = better recovery</span>
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {day.features.map((feature) => <FeatureRow key={feature.metric} feature={feature} />)}
        </div>
      </div>
    </details>
  );
}

function FeatureRow({ feature }: { feature: RecoveryFeature }) {
  const sourceText = feature.sources
    .map((source) => `${source.provenance.deviceLabel} · ${source.baselineDays} baseline days`)
    .join("; ");
  return (
    <div className="rounded-xl bg-surface-container-high px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-on-surface">{feature.label}</span>
        <span className={`text-sm font-bold tabular-nums ${impactStyle[feature.impact]}`}>
          {formatSigma(feature.recoveryZ)}
        </span>
      </div>
      <div className="mt-1 text-xs tabular-nums text-on-surface-variant">
        {feature.value == null || feature.expected == null
          ? "Related source definitions were standardized separately"
          : `${formatValue(feature.value)} ${feature.unit} · expected ${formatValue(feature.expected)} ${feature.unit}`}
      </div>
      <div className="mt-1 text-[10px] text-outline">{sourceText}</div>
    </div>
  );
}

function formatSigma(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}σ`;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}
