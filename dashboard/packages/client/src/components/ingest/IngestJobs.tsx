import type {
  IngestRun,
  IngestRunTypeDetail,
  IngestState,
  WindmillCompletedJob,
  WindmillJob,
} from "@health-dashboard/shared";
import { STATUS } from "../charts/chartPalette";
import {
  HISTORY_TARGET_DAYS,
  historyDaysCovered,
  isHistoryTargetMet,
} from "../../lib/ingestCoverage";
import { windmillJobPhase } from "../../lib/ingestJobs";
import {
  findMatchingRun,
  formatJobDuration,
  scheduleLabel,
} from "./ingestModel";

export function ActiveJobsPanel({
  jobs,
  runningCount,
  scheduledCount,
  queuedCount,
}: {
  jobs: WindmillJob[];
  runningCount: number;
  scheduledCount: number;
  queuedCount: number;
}) {
  if (jobs.length === 0) return null;

  return (
    <section className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-outline-variant/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="font-bold font-headline text-on-surface">
          Upcoming & active jobs
        </h2>
        <span className="text-[10px] font-bold text-outline uppercase tracking-widest">
          {runningCount} running · {scheduledCount} scheduled · {queuedCount} queued
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-left">
          <thead className="bg-surface-container-low text-[10px] text-outline uppercase font-bold tracking-wider">
            <tr>
              <th className="px-6 py-3">Job ID</th>
              <th className="px-6 py-3">Source</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Timing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {jobs.map((job) => {
              const source = scheduleLabel(job.schedulePath);
              const phase = windmillJobPhase(job);
              const statusLabel =
                phase === "running"
                  ? "Processing"
                  : phase === "scheduled"
                    ? "Scheduled"
                    : "Queued";
              const timing =
                phase === "running" && job.startedAt
                  ? new Date(job.startedAt).toLocaleTimeString()
                  : phase === "scheduled" && job.scheduledFor
                    ? new Date(job.scheduledFor).toLocaleString()
                    : "—";
              return (
                <tr key={job.id} className="hover:bg-surface-bright/30">
                  <td className="px-6 py-4 text-sm font-bold tabular-nums text-on-surface">
                    {job.id.slice(0, 8)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${source.color}`}>
                      {source.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        phase === "running"
                          ? "bg-secondary"
                          : phase === "scheduled"
                            ? "bg-tertiary"
                            : "bg-outline"
                      }`} aria-hidden="true" />
                      <span className={`text-xs font-medium ${
                        phase === "running"
                          ? "text-secondary"
                          : phase === "scheduled"
                            ? "text-tertiary"
                            : "text-outline"
                      }`}>
                        {statusLabel}
                      </span>
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
    </section>
  );
}

const COVERAGE_TYPES = [
  "activity",
  "sleep",
  "heart_rate",
  "body_weight",
  "spo2",
  "hrv",
  "breathing_rate",
  "skin_temp",
  "exercise_log",
];

export function HistoricalCoveragePanel({ state }: { state: IngestState[] }) {
  const stateByType = new Map(state.map((item) => [item.dataType, item]));
  const visible = COVERAGE_TYPES.flatMap((dataType) => {
    const item = stateByType.get(dataType);
    return item ? [item] : [];
  });

  return (
    <section className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-outline-variant/10">
        <h2 className="font-bold font-headline text-on-surface">
          Historical Coverage by Data Type
        </h2>
      </div>
      <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
        {visible.map((item, index) => {
          const daysFetched = historyDaysCovered(item);
          const targetMet = isHistoryTargetMet(item);
          const targetDays = item.coverage?.targetDays ?? HISTORY_TARGET_DAYS;
          const coveragePercent = Math.min(
            100,
            Math.round((daysFetched / targetDays) * 100),
          );
          const colors = ["bg-primary", "bg-secondary", "bg-tertiary"];
          const barColor = targetMet ? "bg-secondary" : colors[index % colors.length];
          const displayedPercent = targetMet ? 100 : coveragePercent;

          return (
            <div key={item.dataType} className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className="text-on-surface-variant capitalize">
                  {item.dataType.replace(/_/g, " ")}
                </span>
                <span className="text-on-surface tabular-nums">
                  {displayedPercent}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${item.dataType.replace(/_/g, " ")} history coverage`}
                aria-valuenow={displayedPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden"
              >
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${displayedPercent}%` }}
                />
              </div>
              <p className="text-[10px] text-outline tabular-nums">
                {coverageDescription(item, daysFetched, targetMet)}
              </p>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-outline md:col-span-2">
            No ingest state data yet.
          </p>
        )}
      </div>
    </section>
  );
}

function coverageDescription(
  state: IngestState,
  daysFetched: number,
  targetMet: boolean,
): string {
  let description =
    state.coverage?.status === "provider_limited"
      ? `Available Google Health history captured · ${daysFetched} days`
      : targetMet
        ? `${state.coverage?.targetDays ?? HISTORY_TARGET_DAYS}-day history target met`
        : `${state.earliestFetchedDate ?? "—"} to ${state.latestFetchedDate ?? "—"}`;
  if (state.metricFreshness?.status === "stale") {
    description += ` · stale (${state.metricFreshness.ageDays}d old)`;
  } else if (state.metricFreshness?.status === "sparse") {
    description += " · recorded as available";
  }
  return description;
}

export function JobHistoryPanel({
  jobs,
  runs,
  expandedJobs,
  onToggle,
}: {
  jobs: WindmillCompletedJob[];
  runs: IngestRun[];
  expandedJobs: Set<string>;
  onToggle: (jobId: string) => void;
}) {
  return (
    <section className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between gap-3">
        <h2 className="font-bold font-headline text-on-surface">Job history</h2>
        <span className="text-xs text-outline">{jobs.length} recent jobs</span>
      </div>
      <div className="divide-y divide-outline-variant/10">
        {jobs.map((job) => {
          const source = scheduleLabel(job.schedulePath);
          const databaseRun = findMatchingRun(job.startedAt, runs);
          const isExpanded = expandedJobs.has(job.id);
          const hasDetails =
            databaseRun?.details &&
            Object.keys(databaseRun.details).length > 0;

          return (
            <div key={job.id}>
              <button
                type="button"
                onClick={() => onToggle(job.id)}
                aria-expanded={isExpanded}
                aria-controls={`job-details-${job.id}`}
                aria-label={`View details for job ${job.id}`}
                className="w-full text-left px-4 sm:px-6 py-4 flex items-center justify-between gap-3 hover:bg-surface-bright/20 group"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <JobStatusIcon job={job} run={databaseRun} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-on-surface flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${source.color}`}>
                        {source.label}
                      </span>
                      <code className="text-xs text-outline tabular-nums">
                        #{job.id.slice(0, 8)}
                      </code>
                    </div>
                    <div className="text-[10px] text-outline tabular-nums uppercase mt-0.5">
                      {jobStatusLabel(job, databaseRun)} ·{" "}
                      {job.startedAt
                        ? new Date(job.startedAt).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                  {job.durationMs != null && (
                    <div className="hidden md:block text-right">
                      <div className="text-[10px] text-outline uppercase font-bold">
                        Duration
                      </div>
                      <div className="text-xs font-semibold tabular-nums text-on-surface-variant">
                        {formatJobDuration(job.durationMs)}
                      </div>
                    </div>
                  )}
                  {databaseRun && (
                    <div className="hidden md:block text-right">
                      <div className="text-[10px] text-outline uppercase font-bold">
                        Records
                      </div>
                      <div className="text-xs font-semibold tabular-nums text-on-surface-variant">
                        {(databaseRun.rowsWritten ?? 0).toLocaleString()}
                      </div>
                    </div>
                  )}
                  <span className={`material-symbols-outlined text-outline transition-transform ${
                    isExpanded ? "rotate-90" : ""
                  }`} aria-hidden="true">
                    chevron_right
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div
                  id={`job-details-${job.id}`}
                  className="mx-4 sm:mx-6 mb-4 p-4 bg-surface-container-low rounded-lg border border-outline-variant/5"
                >
                  {hasDetails ? (
                    <DetailBreakdown details={databaseRun.details!} />
                  ) : databaseRun ? (
                    <p className="text-xs text-outline italic">
                      Run #{databaseRun.ingestRunId} — no per-type breakdown
                      available.
                    </p>
                  ) : job.success ? (
                    <p className="text-xs text-outline italic">
                      Job completed but no matching database run was found.
                    </p>
                  ) : (
                    <p className="text-xs text-error italic">
                      Job failed before writing data. Check Windmill logs for job{" "}
                      {job.id.slice(0, 12)}…
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {jobs.length === 0 && (
          <p className="py-8 text-center text-sm text-outline">
            No completed jobs yet.
          </p>
        )}
      </div>
    </section>
  );
}

function DetailBreakdown({
  details,
}: {
  details: Record<string, IngestRunTypeDetail>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {Object.entries(details).map(([dataType, detail]) => (
        <div key={dataType} className="bg-surface-container rounded-lg px-3 py-2 border border-outline-variant/5">
          <div className="text-xs font-medium text-on-surface capitalize mb-1">
            {dataType.replace(/_/g, " ")}
          </div>
          <div className="text-lg font-semibold font-headline tabular-nums text-on-surface">
            {detail.rows}{" "}
            <span className="text-xs font-normal text-outline">rows</span>
          </div>
          {detail.range && (
            <div className="text-xs text-outline mt-0.5 tabular-nums">
              {detail.range}
            </div>
          )}
          {detail.errors > 0 && (
            <div className="text-xs text-error mt-0.5">
              {detail.errors} error{detail.errors === 1 ? "" : "s"}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function JobStatusIcon({
  job,
  run,
}: {
  job: WindmillCompletedJob;
  run?: IngestRun;
}) {
  const icon = job.isSkipped
    ? "skip_next"
    : (run?.status === "completed" || (!run && job.success))
      ? "check_circle"
      : "error";
  const color = job.isSkipped
    ? undefined
    : run
      ? run.status === "completed"
        ? STATUS.good
        : STATUS.critical
      : job.success
        ? STATUS.good
        : STATUS.critical;
  return (
    <span
      className={`material-symbols-outlined ${job.isSkipped ? "text-outline" : ""}`}
      style={{ fontVariationSettings: "'FILL' 1", color }}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

function jobStatusLabel(
  job: WindmillCompletedJob,
  run?: IngestRun,
): string {
  if (job.isSkipped) return "SKIPPED";
  if (run?.status) return run.status.toUpperCase();
  return job.success ? "COMPLETED" : "FAILED";
}
