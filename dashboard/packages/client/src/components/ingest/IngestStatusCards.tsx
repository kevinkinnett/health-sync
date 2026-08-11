import type {
  IngestState,
  IngestStatus,
  WindmillSchedule,
} from "@health-dashboard/shared";
import {
  HISTORY_TARGET_DAYS,
  findLargestCoverageGap,
  isHistoryTargetMet,
  isTrackedCoverageState,
} from "../../lib/ingestCoverage";
import { cronToHuman } from "./ingestModel";

export function PipelineHeader({
  databaseStatus,
  windmillConnected,
  refreshing,
  onRefresh,
}: {
  databaseStatus: "checking" | "online" | "offline";
  windmillConnected: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold font-headline text-on-surface mb-2">
          Pipeline Status
        </h1>
        <div className="flex flex-wrap gap-3">
          <ConnectionBadge label="Database" status={databaseStatus} />
          <ConnectionBadge
            label="Windmill"
            status={windmillConnected ? "online" : "offline"}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="w-full md:w-auto justify-center bg-surface-container-high px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 border border-outline-variant/15 hover:bg-surface-bright transition-colors disabled:cursor-wait disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          refresh
        </span>
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </section>
  );
}

function ConnectionBadge({
  label,
  status,
}: {
  label: string;
  status: "checking" | "online" | "offline";
}) {
  const ok = status === "online";
  const checking = status === "checking";
  const classes = ok
    ? "bg-secondary/10 text-secondary border-secondary/20"
    : checking
      ? "bg-surface-container-high text-outline border-outline-variant/20"
      : "bg-error/10 text-error border-error/20";

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${classes}`}>
      <span
        className={`h-2 w-2 rounded-full ${
          ok ? "bg-secondary" : checking ? "bg-outline" : "bg-error"
        }`}
        aria-hidden="true"
      />
      <span className="text-xs font-semibold uppercase tracking-wider">
        {label}: {checking ? "Checking…" : ok ? "Online" : "Unavailable"}
      </span>
    </div>
  );
}

export function PartialRefreshWarning() {
  return (
    <div role="alert" className="p-4 bg-tertiary/10 border-l-4 border-tertiary rounded-r-xl flex items-start gap-3">
      <span className="material-symbols-outlined text-tertiary" aria-hidden="true">
        cloud_off
      </span>
      <p className="text-sm text-on-surface-variant">
        Refresh failed. Showing the last pipeline status received by this page.
      </p>
    </div>
  );
}

export function PipelineNotices({
  status,
  state,
}: {
  status: IngestStatus | null;
  state: IngestState[];
}) {
  return (
    <>
      <FreshnessWarning status={status} />
      <MetricFreshnessSummary state={state} />
      <CoverageSummaryCard state={state} />
    </>
  );
}

function FreshnessWarning({ status }: { status: IngestStatus | null }) {
  if (!status || status.freshness.status === "healthy") return null;
  const { freshness, provenance } = status;
  const hasLastSuccess = Boolean(freshness.lastSuccessAtUtc);

  return (
    <div role="alert" className="p-4 bg-error/10 border-l-4 border-error rounded-r-xl flex items-start gap-4">
      <span className="material-symbols-outlined text-error mt-0.5" aria-hidden="true">
        sync_problem
      </span>
      <div>
        <h2 className="text-sm font-bold text-error uppercase tracking-wider">
          {hasLastSuccess
            ? "Google Health sync overdue"
            : "Google Health sync not observed"}
        </h2>
        <p className="text-on-surface-variant text-sm mt-1">
          {provenance.deviceLabel} data arrives through {provenance.providerLabel}
          every four hours. {hasLastSuccess
            ? `The last successful run was ${new Date(freshness.lastSuccessAtUtc!).toLocaleString()}, outside the ${freshness.staleAfterMinutes / 60}-hour freshness window.`
            : "No successful run is recorded yet."} Check the Windmill schedule
          and job logs.
        </p>
      </div>
    </div>
  );
}

function MetricFreshnessSummary({ state }: { state: IngestState[] }) {
  if (!state.some((item) => item.metricFreshness != null)) return null;
  const stale = state.filter((item) => item.metricFreshness?.status === "stale");
  const unknown = state.filter(
    (item) => item.metricFreshness?.status === "unknown",
  );
  const sparse = state.filter(
    (item) => item.metricFreshness?.status === "sparse",
  );
  const needsAttention = [...stale, ...unknown];

  if (needsAttention.length === 0) {
    return (
      <div className="p-4 bg-secondary/10 border-l-4 border-secondary rounded-r-xl flex items-center gap-3">
        <span className="material-symbols-outlined text-secondary" aria-hidden="true">
          update
        </span>
        <div>
          <span className="text-sm font-bold text-secondary">
            Daily metric feeds are current
          </span>
          {sparse.length > 0 && (
            <span className="text-xs text-on-surface-variant ml-2">
              {sparse
                .map((item) => item.dataType.replace(/_/g, " "))
                .join(" and ")} are checked only when recorded.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div role="alert" className="p-4 bg-tertiary/10 border-l-4 border-tertiary rounded-r-xl flex items-start gap-4">
      <span className="material-symbols-outlined text-tertiary mt-0.5" aria-hidden="true">
        data_alert
      </span>
      <div>
        <h2 className="text-sm font-bold text-tertiary uppercase tracking-wider">
          Metric data needs attention
        </h2>
        <p className="text-on-surface-variant text-sm mt-1">
          {needsAttention
            .map((item) => item.dataType.replace(/_/g, " "))
            .join(", ")} {needsAttention.length === 1 ? "is" : "are"} missing
          recent daily measurements. The pipeline heartbeat can remain healthy
          even when a single metric stops updating.
        </p>
      </div>
    </div>
  );
}

function CoverageSummaryCard({ state }: { state: IngestState[] }) {
  const trackedState = state.filter(isTrackedCoverageState);
  if (trackedState.length === 0) return null;
  if (trackedState.every(isHistoryTargetMet)) {
    const providerLimited = trackedState.filter(
      (item) => item.coverage?.status === "provider_limited",
    );
    return (
      <div className="p-4 bg-secondary/10 border-l-4 border-secondary rounded-r-xl flex items-center gap-3">
        <span className="material-symbols-outlined text-secondary" aria-hidden="true">
          check_circle
        </span>
        <div>
          <span className="text-sm font-bold text-secondary">
            Historical coverage target met
          </span>
          <span className="text-xs text-on-surface-variant ml-2">
            All tracked metrics meet their provider-aware target.
            {providerLimited.length > 0
              ? ` ${providerLimited.map((item) => item.dataType.replace(/_/g, " ")).join(", ")} uses the available Google Health window.`
              : ""}
          </span>
        </div>
      </div>
    );
  }

  const gap = findLargestCoverageGap(trackedState);
  if (!gap) return null;
  return (
    <div className="p-4 bg-tertiary/10 border-l-4 border-tertiary rounded-r-xl flex items-start gap-4">
      <span className="material-symbols-outlined text-tertiary mt-0.5" aria-hidden="true">
        history
      </span>
      <div className="flex-1">
        <h2 className="text-sm font-bold text-tertiary uppercase tracking-wider">
          Historical coverage
        </h2>
        <p className="text-on-surface-variant text-sm mt-1">
          <span className="capitalize">{gap.dataType.replace(/_/g, " ")}</span>{" "}
          currently has <strong>{gap.daysCovered} days</strong> of the{" "}
          {HISTORY_TARGET_DAYS}-day target. Google Health may expose different
          history depths by metric.
        </p>
      </div>
    </div>
  );
}

const SCHEDULE_DESCRIPTIONS: Record<
  string,
  { title: string; description: string }
> = {
  ingest_google_health: {
    title: "Google Health Sync",
    description:
      "Captures Google Health data and refreshes the dashboard's daily health metrics every four hours.",
  },
};

export function ScheduleGrid({
  schedules,
  windmillConnected,
  triggeredSchedulePath,
  triggerJobId,
  triggerError,
  isTriggering,
  onTrigger,
}: {
  schedules: WindmillSchedule[];
  windmillConnected: boolean;
  triggeredSchedulePath: string | null;
  triggerJobId: string | null;
  triggerError: string | null;
  isTriggering: boolean;
  onTrigger: (path: string) => Promise<void>;
}) {
  if (schedules.length === 0) {
    return (
      <div className="bg-surface-container rounded-xl border border-outline-variant/10 p-5 text-sm text-on-surface-variant">
        {windmillConnected
          ? "No dashboard-managed schedules were returned."
          : "Windmill schedules are unavailable. Existing external schedules have not been changed."}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {schedules.map((schedule) => {
        const selected = triggeredSchedulePath === schedule.path;
        return (
          <ScheduleCard
            key={schedule.path}
            schedule={schedule}
            isTriggering={selected && isTriggering}
            jobId={selected ? triggerJobId : null}
            error={selected ? triggerError : null}
            onTrigger={() => onTrigger(schedule.path)}
          />
        );
      })}
    </div>
  );
}

function ScheduleCard({
  schedule,
  isTriggering,
  jobId,
  error,
  onTrigger,
}: {
  schedule: WindmillSchedule;
  isTriggering: boolean;
  jobId: string | null;
  error: string | null;
  onTrigger: () => Promise<void>;
}) {
  const name = schedule.path.split("/").pop() ?? schedule.path;
  const meta = SCHEDULE_DESCRIPTIONS[name];
  const isBackfill = name.includes("backfill");

  return (
    <article className="bg-surface-container p-6 rounded-xl border border-outline-variant/10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          isBackfill ? "bg-tertiary/10 text-tertiary" : "bg-primary/10 text-primary"
        }`}>
          <span className="material-symbols-outlined" aria-hidden="true">
            {isBackfill ? "history" : "sync"}
          </span>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full font-bold tracking-widest uppercase bg-surface-container-high text-outline">
          {schedule.enabled ? cronToHuman(schedule.schedule) : "Disabled"}
        </span>
      </div>
      <h2 className="text-lg font-bold font-headline text-on-surface">
        {meta?.title ?? name}
      </h2>
      <p className="text-on-surface-variant text-xs mt-1 mb-5 leading-relaxed">
        {meta?.description ?? schedule.summary ?? "Windmill schedule."}
      </p>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-[10px] text-outline font-semibold uppercase tracking-tighter">
          Cron: <span className="text-on-surface-variant">{schedule.schedule}</span>
        </div>
        <button
          type="button"
          onClick={() => void onTrigger()}
          disabled={isTriggering || !schedule.enabled}
          className="w-full sm:w-auto bg-surface-container-highest px-4 py-2.5 rounded-lg text-xs font-bold hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isTriggering ? "Starting…" : "Run now"}
        </button>
      </div>
      {jobId && (
        <div role="status" className="mt-3 text-xs text-secondary">
          Job started: <code className="bg-secondary/10 px-1 rounded tabular-nums">{jobId}</code>
        </div>
      )}
      {error && <div role="alert" className="mt-3 text-xs text-error">Could not start job: {error}</div>}
    </article>
  );
}
