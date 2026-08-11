import { useState } from "react";
import {
  useIngestOverview,
  useTriggerIngest,
  useHealthCheck,
} from "../api/queries";
import type {
  WindmillSchedule,
  IngestRun,
  IngestRunTypeDetail,
  IngestState,
  IngestStatus,
} from "@health-dashboard/shared";
import { STATUS } from "../components/charts/chartPalette";
import {
  HISTORY_TARGET_DAYS,
  findLargestCoverageGap,
  historyDaysCovered,
  isHistoryTargetMet,
  isTrackedCoverageState,
} from "../lib/ingestCoverage";
import { PageError, PageSkeleton } from "../components/ui/PageState";
import { windmillJobPhase } from "../lib/ingestJobs";

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function cronToHuman(cron: string): string {
  if (cron === "0 0 12 * * *") return "Every day at 12:00 PM UTC";
  if (cron === "0 0 */2 * * *") return "Every 2 hours";
  return cron;
}

/**
 * Renders an ingest job's wall-clock duration in `Xm Ys` for ≥1 min
 * runs, falling back to `Ns` for fast ones. Reserved for the
 * sub-hour timing the ingest jobs tend to produce — see
 * `formatWorkoutDuration` in `ExerciseLogTable.tsx` for the
 * h-and-m variant used on workouts.
 */
function formatJobDuration(ms: number): string {
  if (ms >= 60_000)
    return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${Math.round(ms / 1000)}s`;
}

function scheduleLabel(path: string | null): { label: string; color: string } {
  if (!path)
    return { label: "Manual", color: "bg-primary/10 text-primary" };
  if (path.includes("google_health"))
    return { label: "Google Health", color: "bg-secondary/10 text-secondary" };
  if (path.includes("backfill"))
    return { label: "Backfill", color: "bg-tertiary/10 text-tertiary" };
  if (path.includes("daily"))
    return { label: "Daily", color: "bg-secondary/10 text-secondary" };
  return {
    label: path.split("/").pop() ?? path,
    color: "bg-surface-container-highest text-on-surface-variant",
  };
}

function findMatchingRun(
  jobStartedAt: string | null,
  runs: IngestRun[],
): IngestRun | undefined {
  if (!jobStartedAt) return undefined;
  const jobTs = new Date(jobStartedAt).getTime();
  return runs.find((r) => {
    const runTs = new Date(r.startedAtUtc).getTime();
    return Math.abs(jobTs - runTs) < 5_000;
  });
}

// ────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────

function DetailBreakdown({ details }: { details: Record<string, IngestRunTypeDetail> }) {
  const types = Object.entries(details);
  if (types.length === 0) return <span className="text-xs text-outline italic">No type-level data</span>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {types.map(([dataType, d]) => (
        <div key={dataType} className="bg-surface-container-low rounded-lg px-3 py-2 border border-outline-variant/5">
          <div className="text-xs font-medium text-on-surface capitalize mb-1">{dataType.replace(/_/g, " ")}</div>
          <div className="text-lg font-semibold font-headline tabular-nums text-on-surface">
            {d.rows} <span className="text-xs font-normal text-outline">rows</span>
          </div>
          {d.range && <div className="text-xs text-outline mt-0.5 tabular-nums">{d.range}</div>}
          {d.errors > 0 && <div className="text-xs text-error mt-0.5">{d.errors} error{d.errors > 1 ? "s" : ""}</div>}
        </div>
      ))}
    </div>
  );
}

function DbStatusIndicator({ windmillConnected }: { windmillConnected: boolean }) {
  const health = useHealthCheck();
  const connected = health.data?.dbConnected === true;
  const loading = health.isLoading;
  const error = health.isError;

  const items = [
    {
      label: "Database",
      status: loading ? "Checking..." : connected ? "Online" : error ? "Unreachable" : "Disconnected",
      ok: !loading && connected,
    },
    {
      label: "Windmill",
      status: windmillConnected ? "Connected" : "Unavailable",
      ok: windmillConnected,
    },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <div key={item.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${item.ok ? "bg-secondary/10 text-secondary border-secondary/20" : "bg-error/10 text-error border-error/20"}`}>
          <span className="relative flex h-2 w-2">
            {item.ok && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${item.ok ? "bg-secondary" : "bg-error"}`} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider">{item.label}: {item.status}</span>
        </div>
      ))}
    </div>
  );
}

function CoverageSummaryCard({ state }: { state: IngestState[] }) {
  const trackedState = state.filter(isTrackedCoverageState);
  if (trackedState.length === 0) return null;
  if (trackedState.every(isHistoryTargetMet)) {
    const providerLimited = trackedState.filter((item) => item.coverage?.status === "provider_limited");
    return (
      <div className="p-4 bg-secondary/10 border-l-4 border-secondary rounded-r-xl flex items-center gap-3">
        <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        <div>
          <span className="text-sm font-bold text-secondary">Historical coverage target met</span>
          <span className="text-xs text-on-surface-variant ml-2">
            All tracked metrics meet their provider-aware target.
            {providerLimited.length > 0 ? ` ${providerLimited.map((item) => item.dataType.replace(/_/g, " ")).join(", ")} uses the available Google Health window.` : ""}
          </span>
        </div>
      </div>
    );
  }
  const gap = findLargestCoverageGap(trackedState);
  if (!gap) return null;

  return (
    <div className="p-4 bg-tertiary/10 border-l-4 border-tertiary rounded-r-xl flex items-start gap-4">
      <span className="material-symbols-outlined text-tertiary mt-0.5">history</span>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-tertiary uppercase tracking-wider">Historical Coverage</h4>
          <span className="text-xs text-on-surface-variant">Largest gap: <span className="capitalize">{gap.dataType.replace(/_/g, " ")}</span></span>
        </div>
        <p className="text-on-surface-variant text-sm mt-1">
          <span className="capitalize">{gap.dataType.replace(/_/g, " ")}</span> currently has <span className="text-on-surface font-bold tabular-nums">{gap.daysCovered} days</span> of the {HISTORY_TARGET_DAYS}-day target. Google Health may expose different history depths by metric.
        </p>
      </div>
    </div>
  );
}

function MetricFreshnessSummary({ state }: { state: IngestState[] }) {
  if (!state.some((item) => item.metricFreshness != null)) return null;
  const stale = state.filter((item) => item.metricFreshness?.status === "stale");
  const unknown = state.filter((item) => item.metricFreshness?.status === "unknown");
  const sparse = state.filter((item) => item.metricFreshness?.status === "sparse");
  const needsAttention = [...stale, ...unknown];

  if (needsAttention.length === 0) {
    return (
      <div className="p-4 bg-secondary/10 border-l-4 border-secondary rounded-r-xl flex items-center gap-3">
        <span className="material-symbols-outlined text-secondary">update</span>
        <div>
          <span className="text-sm font-bold text-secondary">Daily metric feeds are current</span>
          {sparse.length > 0 && (
            <span className="text-xs text-on-surface-variant ml-2">
              {sparse.map((item) => item.dataType.replace(/_/g, " ")).join(" and ")} are checked only when recorded.
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div role="alert" className="p-4 bg-tertiary/10 border-l-4 border-tertiary rounded-r-xl flex items-start gap-4">
      <span className="material-symbols-outlined text-tertiary mt-0.5">data_alert</span>
      <div>
        <h4 className="text-sm font-bold text-tertiary uppercase tracking-wider">Metric data needs attention</h4>
        <p className="text-on-surface-variant text-sm mt-1">
          {needsAttention.map((item) => item.dataType.replace(/_/g, " ")).join(", ")} {needsAttention.length === 1 ? "is" : "are"} missing recent daily measurements. The pipeline heartbeat can remain healthy even when a single metric stops updating.
        </p>
      </div>
    </div>
  );
}

function FreshnessWarning({ status }: { status: IngestStatus | null }) {
  if (!status || status.freshness.status === "healthy") return null;

  const { freshness, provenance } = status;
  const hasLastSuccess = Boolean(freshness.lastSuccessAtUtc);
  return (
    <div
      role="alert"
      className="p-4 bg-error/10 border-l-4 border-error rounded-r-xl flex items-start gap-4"
    >
      <span className="material-symbols-outlined text-error mt-0.5">sync_problem</span>
      <div>
        <h4 className="text-sm font-bold text-error uppercase tracking-wider">
          {hasLastSuccess ? "Google Health sync overdue" : "Google Health sync not observed"}
        </h4>
        <p className="text-on-surface-variant text-sm mt-1">
          {provenance.deviceLabel} data arrives through {provenance.providerLabel} every four hours. {hasLastSuccess
            ? `The last successful run was ${new Date(freshness.lastSuccessAtUtc!).toLocaleString()}, outside the ${freshness.staleAfterMinutes / 60}-hour freshness window.`
            : "No successful run is recorded yet."} Check the Windmill schedule and job logs.
        </p>
      </div>
    </div>
  );
}

const SCHEDULE_DESCRIPTIONS: Record<string, { title: string; description: string }> = {
  ingest_google_health: {
    title: "Google Health Sync",
    description: "Captures Google Health data and refreshes the dashboard's daily health metrics every four hours.",
  },
};

function ScheduleCard({ schedule }: { schedule: WindmillSchedule }) {
  const trigger = useTriggerIngest();
  const name = schedule.path.split("/").pop() ?? schedule.path;
  const meta = SCHEDULE_DESCRIPTIONS[name];
  const isBackfill = name.includes("backfill");

  return (
    <div className="bg-surface-container p-6 rounded-xl border border-outline-variant/10 relative overflow-hidden">
      {isBackfill && <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary/5 rounded-full blur-3xl -mr-12 -mt-12" />}
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isBackfill ? "bg-tertiary/10 text-tertiary" : "bg-primary/10 text-primary"}`}>
          <span className="material-symbols-outlined">{isBackfill ? "history" : "sync"}</span>
        </div>
        <span className={`text-[10px] px-2 py-1 rounded-full font-bold tracking-widest uppercase ${
          schedule.enabled
            ? isBackfill ? "bg-tertiary-container/20 text-tertiary" : "bg-surface-container-high text-outline"
            : "bg-surface-container-high text-outline"
        }`}>
          {schedule.enabled ? (isBackfill ? "Ongoing" : cronToHuman(schedule.schedule).split(" ").slice(-2).join(" ")) : "Disabled"}
        </span>
      </div>
      <h3 className="text-lg font-bold font-headline text-on-surface">{meta?.title ?? name}</h3>
      <p className="text-on-surface-variant text-xs mt-1 mb-6 leading-relaxed">{meta?.description ?? schedule.summary ?? "Windmill schedule."}</p>
      <div className="flex items-center justify-between gap-4">
        <div className="text-[10px] text-outline font-semibold uppercase tracking-tighter">
          Cron: <span className="text-on-surface-variant">{schedule.schedule}</span>
        </div>
        <button
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending || !schedule.enabled}
          className="bg-surface-container-highest px-4 py-2 rounded-lg text-xs font-bold hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {trigger.isPending ? "Running..." : "Run Now"}
        </button>
      </div>
      {trigger.isSuccess && trigger.data.jobId && (
        <div className="mt-2 text-xs text-secondary">Job triggered: <code className="bg-secondary/10 px-1 rounded tabular-nums">{trigger.data.jobId}</code></div>
      )}
      {trigger.isError && (
        <div className="mt-2 text-xs text-error">Error: {(trigger.error as Error).message}</div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────

export function Ingest() {
  const overview = useIngestOverview();
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  if (overview.isLoading) return <PageSkeleton />;
  if (overview.isError && !overview.data) {
    return (
      <PageError
        title="Vitalis couldn’t load pipeline status"
        message="The dashboard could not reach the ingestion overview. No jobs were started and your stored data has not been changed."
        onRetry={() => void overview.refetch()}
      />
    );
  }

  // Normalize at the UI boundary so a client can safely overlap an older API
  // deployment, or render a partial response without taking down the page.
  const data = overview.data;
  const state = Array.isArray(data?.state) ? data.state : [];
  const runs = Array.isArray(data?.runs) ? data.runs : [];
  const windmillConnected = data?.windmillConnected === true;
  const activeJobs = Array.isArray(data?.activeJobs) ? data.activeJobs : [];
  const completedJobs = Array.isArray(data?.completedJobs) ? data.completedJobs : [];
  const schedules = Array.isArray(data?.schedules) ? data.schedules : [];
  const runningJobCount = activeJobs.filter(
    (job) => windmillJobPhase(job) === "running",
  ).length;
  const scheduledJobCount = activeJobs.filter(
    (job) => windmillJobPhase(job) === "scheduled",
  ).length;
  const queuedJobCount = activeJobs.length - runningJobCount - scheduledJobCount;

  const toggleExpanded = (jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-headline text-on-surface mb-2">Pipeline Status</h1>
          <DbStatusIndicator windmillConnected={windmillConnected} />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void overview.refetch()}
            disabled={overview.isFetching}
            className="bg-surface-container-high px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 border border-outline-variant/15 hover:bg-surface-bright transition-colors disabled:cursor-wait disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[20px]">refresh</span>
            {overview.isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      {/* Historical coverage summary */}
      <FreshnessWarning status={data?.status ?? null} />
      <MetricFreshnessSummary state={state} />
      <CoverageSummaryCard state={state} />

      {/* Schedule Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {schedules.map((s) => (
          <ScheduleCard key={s.path} schedule={s} />
        ))}
      </div>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
            <h3 className="font-bold font-headline text-on-surface">Upcoming & Active Jobs</h3>
            <span className="text-[10px] font-bold text-outline uppercase tracking-widest">
              {runningJobCount} Running · {scheduledJobCount} Scheduled · {queuedJobCount} Queued
            </span>
          </div>
          <table className="w-full text-left">
            <thead className="bg-surface-container-low text-[10px] text-outline uppercase font-bold tracking-wider">
              <tr>
                <th className="px-6 py-3">Job ID</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Timing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {activeJobs.map((job) => {
                const source = scheduleLabel(job.schedulePath);
                const phase = windmillJobPhase(job);
                const statusLabel = phase === "running" ? "Processing" : phase === "scheduled" ? "Scheduled" : "Queued";
                const timing = phase === "running" && job.startedAt
                  ? new Date(job.startedAt).toLocaleTimeString()
                  : phase === "scheduled" && job.scheduledFor
                    ? new Date(job.scheduledFor).toLocaleString()
                    : "—";
                return (
                  <tr key={job.id} className="hover:bg-surface-bright/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold tabular-nums text-on-surface">{job.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-6 py-4"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${source.color}`}>{source.label}</span></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${phase === "running" ? "bg-secondary shadow-[0_0_8px_#4edea3]" : phase === "scheduled" ? "bg-tertiary" : "bg-outline"}`} />
                        <span className={`text-xs font-medium ${phase === "running" ? "text-secondary" : phase === "scheduled" ? "text-tertiary" : "text-outline"}`}>{statusLabel}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-on-surface-variant tabular-nums">
                      {timing}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Historical coverage */}
      <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10">
          <h3 className="font-bold font-headline text-on-surface">Historical Coverage by Data Type</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
          {(() => {
            const DAILY = ["activity", "sleep", "heart_rate", "body_weight"];
            const RANGE = ["spo2", "hrv", "breathing_rate", "skin_temp"];
            const PAGINATED = ["exercise_log"];
            const stateByType = Object.fromEntries(state.map((s) => [s.dataType, s]));
            const all = [...DAILY, ...RANGE, ...PAGINATED];
            const colors = ["bg-primary", "bg-secondary", "bg-tertiary", "bg-tertiary-container"];

            return all.map((t, i) => {
              const s = stateByType[t];
              if (!s) return null;
              const daysFetched = historyDaysCovered(s);
              const targetMet = isHistoryTargetMet(s);
              const targetDays = s.coverage?.targetDays ?? HISTORY_TARGET_DAYS;
              const coveragePct = Math.min(100, Math.round((daysFetched / targetDays) * 100));
              const barColor = targetMet ? "bg-secondary" : colors[i % colors.length];
              return (
                <div key={t} className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                    <span className="text-on-surface-variant capitalize">{t.replace(/_/g, " ")}</span>
                    <span className="text-on-surface tabular-nums">{targetMet ? "100%" : `${coveragePct}%`}</span>
                  </div>
                  <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${targetMet ? 100 : coveragePct}%` }} />
                  </div>
                  <p className="text-[10px] text-outline tabular-nums">
                    {s.coverage?.status === "provider_limited"
                      ? `Available Google Health history captured · ${daysFetched} days`
                      : s.historyTargetMet
                      ? `${HISTORY_TARGET_DAYS}-day history target met`
                      : targetMet
                        ? `${HISTORY_TARGET_DAYS}-day history target met`
                        : `${s.earliestFetchedDate ?? "—"} to ${s.latestFetchedDate ?? "—"}`}
                    {s.metricFreshness?.status === "stale"
                      ? ` · stale (${s.metricFreshness.ageDays}d old)`
                      : s.metricFreshness?.status === "sparse"
                        ? " · recorded as available"
                        : ""}
                  </p>
                </div>
              );
            }).filter(Boolean);
          })()}
          {state.length === 0 && <p className="text-sm text-outline col-span-2">No ingest state data yet.</p>}
        </div>
      </div>

      {/* Job History */}
      <div className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between">
          <h3 className="font-bold font-headline text-on-surface">Job History</h3>
          <button className="text-xs font-bold text-primary hover:underline">View Full Log</button>
        </div>
        <div className="divide-y divide-outline-variant/10">
          {completedJobs.map((job) => {
            const source = scheduleLabel(job.schedulePath);
            const dbRun = findMatchingRun(job.startedAt, runs);
            const isExpanded = expandedJobs.has(job.id);
            const hasDetails = dbRun?.details && Object.keys(dbRun.details).length > 0;

            return (
              <div key={job.id}>
                <button
                  type="button"
                  onClick={() => toggleExpanded(job.id)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between hover:bg-surface-bright/20 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    {job.isSkipped ? (
                      <span className="material-symbols-outlined text-outline">skip_next</span>
                    ) : dbRun ? (
                      <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1", color: dbRun.status === "completed" ? STATUS.good : STATUS.critical }}>
                        {dbRun.status === "completed" ? "check_circle" : "error"}
                      </span>
                    ) : job.success ? (
                      <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    ) : (
                      <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                    )}
                    <div>
                      <div className="text-sm font-bold text-on-surface flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${source.color}`}>{source.label}</span>
                        <code className="text-xs text-outline tabular-nums">#{job.id.slice(0, 8)}</code>
                      </div>
                      <div className="text-[10px] text-outline tabular-nums uppercase mt-0.5">
                        {job.isSkipped ? "SKIPPED" : dbRun?.status?.toUpperCase() ?? (job.success ? "COMPLETED" : "FAILED")}
                        {" · "}
                        {job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    {job.durationMs != null && (
                      <div className="hidden md:block text-right">
                        <div className="text-[10px] text-outline uppercase font-bold tracking-tighter">Duration</div>
                        <div className="text-xs font-semibold tabular-nums text-on-surface-variant">{formatJobDuration(job.durationMs)}</div>
                      </div>
                    )}
                    {dbRun && (
                      <div className="hidden md:block text-right">
                        <div className="text-[10px] text-outline uppercase font-bold tracking-tighter">Records</div>
                        <div className="text-xs font-semibold tabular-nums text-on-surface-variant">{(dbRun.rowsWritten ?? 0).toLocaleString()}</div>
                      </div>
                    )}
                    <span className="material-symbols-outlined text-outline group-hover:translate-x-1 transition-transform">chevron_right</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mx-6 mb-4 p-4 bg-surface-container-low rounded-lg border border-outline-variant/5">
                    {hasDetails ? (
                      <DetailBreakdown details={dbRun!.details!} />
                    ) : dbRun ? (
                      <p className="text-xs text-outline italic">Run #{dbRun.ingestRunId} — no per-type breakdown available.</p>
                    ) : job.success ? (
                      <p className="text-xs text-outline italic">Job completed but no matching database run found.</p>
                    ) : (
                      <p className="text-xs text-error italic">Job failed before writing any data. Check Windmill logs for job {job.id.slice(0, 12)}...</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {completedJobs.length === 0 && (
            <p className="py-8 text-center text-sm text-outline">No completed jobs yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
