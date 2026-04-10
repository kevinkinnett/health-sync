import { useState } from "react";
import {
  useIngestOverview,
  useTriggerIngest,
  useHealthCheck,
} from "../api/queries";
import { StatusBadge } from "../components/StatusBadge";
import type {
  WindmillSchedule,
  WindmillCompletedJob,
  IngestRun,
  IngestRunTypeDetail,
  IngestState,
} from "@health-dashboard/shared";

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function cronToHuman(cron: string): string {
  if (cron === "0 0 12 * * *") return "Every day at 12:00 PM UTC";
  if (cron === "0 0 */2 * * *") return "Every 2 hours";
  return cron;
}

function formatDuration(ms: number): string {
  if (ms >= 60_000)
    return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${Math.round(ms / 1000)}s`;
}

function scheduleLabel(path: string | null): { label: string; color: string } {
  if (!path)
    return { label: "Manual", color: "bg-purple-100 text-purple-700" };
  if (path.includes("backfill"))
    return { label: "Backfill", color: "bg-orange-100 text-orange-700" };
  if (path.includes("daily"))
    return { label: "Daily", color: "bg-blue-100 text-blue-700" };
  return {
    label: path.split("/").pop() ?? path,
    color: "bg-gray-100 text-gray-700",
  };
}

/** Match a Windmill completed job to a DB ingest_run by overlapping start time (within 5s). */
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

/**
 * Estimate time to complete backfill based on recent progress.
 *
 * Strategy: look at recent successful runs to compute the average
 * "days of coverage gained per calendar day", then extrapolate
 * from the worst-case (most-remaining) data type.
 */
function computeBackfillEstimate(
  state: IngestState[],
  runs: IngestRun[],
  completedJobs: WindmillCompletedJob[],
): {
  worstType: string;
  daysRemaining: number;
  daysPerDay: number;
  estimatedDays: number | null;
} | null {
  if (state.length === 0) return null;

  // Find the data type with the most days remaining
  let worstType = "";
  let maxRemaining = 0;

  for (const s of state) {
    if (s.backfillComplete) continue;
    const earliest = s.earliestFetchedDate
      ? new Date(s.earliestFetchedDate)
      : null;
    const latest = s.latestFetchedDate
      ? new Date(s.latestFetchedDate)
      : null;
    const daysFetched =
      earliest && latest
        ? Math.round((latest.getTime() - earliest.getTime()) / 86_400_000)
        : 0;
    const remaining = Math.max(0, 365 - daysFetched);
    if (remaining > maxRemaining) {
      maxRemaining = remaining;
      worstType = s.dataType;
    }
  }

  if (maxRemaining === 0) return null; // all complete

  // Calculate average days of data fetched per successful backfill run
  // by looking at recent DB runs that actually wrote rows
  const successfulRuns = runs.filter(
    (r) => (r.rowsWritten ?? 0) > 5 && r.finishedAtUtc,
  );

  if (successfulRuns.length < 2) {
    return { worstType, daysRemaining: maxRemaining, daysPerDay: 0, estimatedDays: null };
  }

  // Compute total days of data fetched across all successful runs for the worst type
  let totalDaysFetched = 0;
  for (const r of successfulRuns) {
    if (!r.details) continue;
    const typeDetail = r.details[worstType];
    if (typeDetail && typeDetail.rows > 0) {
      // Parse range "YYYY-MM-DD to YYYY-MM-DD" to get days covered
      const parts = typeDetail.range.split(" to ");
      if (parts.length === 2) {
        const start = new Date(parts[0]);
        const end = new Date(parts[1]);
        const days = Math.round(
          (end.getTime() - start.getTime()) / 86_400_000,
        );
        if (days > 0) totalDaysFetched += days;
      }
    }
  }

  // Time span of these runs (first to last)
  const oldest = new Date(
    successfulRuns[successfulRuns.length - 1].startedAtUtc,
  );
  const newest = new Date(successfulRuns[0].startedAtUtc);
  const calendarDaysSpanned = Math.max(
    1,
    (newest.getTime() - oldest.getTime()) / 86_400_000,
  );

  // Also factor in backfill schedule frequency: count successful backfill jobs per day
  const backfillJobs = completedJobs.filter(
    (j) => j.success && !j.isSkipped && j.schedulePath?.includes("backfill"),
  );
  const successfulBackfillsPerDay =
    calendarDaysSpanned > 0.1
      ? backfillJobs.length / calendarDaysSpanned
      : 12; // default: every 2h = 12/day

  const daysPerDay =
    totalDaysFetched > 0
      ? totalDaysFetched / calendarDaysSpanned
      : successfulBackfillsPerDay * 20; // rough estimate: ~20 days per run

  const estimatedDays = daysPerDay > 0 ? maxRemaining / daysPerDay : null;

  return { worstType, daysRemaining: maxRemaining, daysPerDay, estimatedDays };
}

// ────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────

function DetailBreakdown({
  details,
}: {
  details: Record<string, IngestRunTypeDetail>;
}) {
  const types = Object.entries(details);
  if (types.length === 0)
    return (
      <span className="text-xs text-gray-400 italic">No type-level data</span>
    );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {types.map(([dataType, d]) => (
        <div
          key={dataType}
          className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100"
        >
          <div className="text-xs font-medium text-gray-700 capitalize mb-1">
            {dataType.replace(/_/g, " ")}
          </div>
          <div className="text-lg font-semibold text-gray-900">
            {d.rows}{" "}
            <span className="text-xs font-normal text-gray-500">rows</span>
          </div>
          {d.range && (
            <div className="text-xs text-gray-400 mt-0.5">{d.range}</div>
          )}
          {d.errors > 0 && (
            <div className="text-xs text-red-500 mt-0.5">
              {d.errors} error{d.errors > 1 ? "s" : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DbStatusIndicator() {
  const health = useHealthCheck();

  const connected = health.data?.dbConnected === true;
  const loading = health.isLoading;
  const error = health.isError;

  let dotColor = "bg-gray-300";
  let label = "Checking...";
  let labelColor = "text-gray-400";

  if (!loading) {
    if (connected) {
      dotColor = "bg-green-500";
      label = "Connected";
      labelColor = "text-green-700";
    } else if (error) {
      dotColor = "bg-red-500";
      label = "Unreachable";
      labelColor = "text-red-700";
    } else {
      dotColor = "bg-red-500";
      label = "Disconnected";
      labelColor = "text-red-700";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-xs font-medium text-gray-500">Database</span>
        <span className={`text-xs font-medium ${labelColor}`}>{label}</span>
      </div>
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs font-medium text-gray-500">Windmill</span>
        <span className="text-xs font-medium text-green-700">Connected</span>
      </div>
    </div>
  );
}

function BackfillEstimateCard({
  state,
  runs,
  completedJobs,
}: {
  state: IngestState[];
  runs: IngestRun[];
  completedJobs: WindmillCompletedJob[];
}) {
  const estimate = computeBackfillEstimate(state, runs, completedJobs);

  if (!estimate) return null;

  const allComplete = state.every((s) => s.backfillComplete);
  if (allComplete) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
        <span className="text-green-600 text-lg">&#10003;</span>
        <div>
          <span className="text-sm font-medium text-green-800">
            Backfill complete!
          </span>
          <span className="text-xs text-green-600 ml-2">
            All data types have 365 days of history. You can disable the
            backfill schedule.
          </span>
        </div>
      </div>
    );
  }

  const { worstType, daysRemaining, daysPerDay, estimatedDays } = estimate;

  let timeStr: string;
  if (estimatedDays == null || daysPerDay === 0) {
    timeStr = "Insufficient data to estimate";
  } else if (estimatedDays < 1) {
    const hours = Math.max(1, Math.round(estimatedDays * 24));
    timeStr = `~${hours} hour${hours !== 1 ? "s" : ""}`;
  } else if (estimatedDays < 30) {
    const d = Math.round(estimatedDays);
    timeStr = `~${d} day${d !== 1 ? "s" : ""}`;
  } else {
    const weeks = Math.round(estimatedDays / 7);
    timeStr = `~${weeks} week${weeks !== 1 ? "s" : ""}`;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-medium text-amber-900">
            Estimated time to complete backfill
          </h4>
          <p className="text-2xl font-bold text-amber-800 mt-1">{timeStr}</p>
        </div>
        <div className="text-right text-xs text-amber-700 space-y-0.5">
          <div>
            Bottleneck:{" "}
            <span className="font-medium capitalize">
              {worstType.replace(/_/g, " ")}
            </span>
          </div>
          <div>
            {daysRemaining} days remaining of 365
          </div>
          {daysPerDay > 0 && (
            <div>
              Avg rate: {Math.round(daysPerDay)} days of data / calendar day
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// Schedule descriptions
// ────────────────────────────────────────────

const SCHEDULE_DESCRIPTIONS: Record<
  string,
  { title: string; description: string }
> = {
  ingest_fitbit_daily: {
    title: "Daily Sync",
    description:
      "Runs once a day at noon UTC (7 AM ET) to fetch yesterday's Fitbit data across 10 data types: activity, sleep, heart rate, body weight, SpO2, HRV, breathing rate, skin temp, VO2 max, and exercise logs. Range-based types (SpO2, HRV, etc.) are fetched first since they cover 30 days per API call, leaving the full budget for daily types.",
  },
  ingest_fitbit_backfill: {
    title: "Historical Backfill",
    description:
      "Runs every 2 hours with a 120-request budget to catch up on historical data. Range types (HRV, SpO2, etc.) are processed first at 1 request per 30 days, then exercise logs, then daily types round-robin. Disable this schedule once all progress bars below reach 100%.",
  },
};

function ScheduleCard({ schedule }: { schedule: WindmillSchedule }) {
  const trigger = useTriggerIngest();
  const name = schedule.path.split("/").pop() ?? schedule.path;
  const meta = SCHEDULE_DESCRIPTIONS[name];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                schedule.enabled ? "bg-green-500" : "bg-gray-300"
              }`}
            />
            <h3 className="text-sm font-semibold text-gray-900">
              {meta?.title ?? name}
            </h3>
            {!schedule.enabled && (
              <span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
                Disabled
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 max-w-lg leading-relaxed">
            {meta?.description ??
              schedule.summary ??
              "Windmill schedule for Fitbit ingest."}
          </p>
        </div>
        <button
          onClick={() => trigger.mutate()}
          disabled={trigger.isPending || !schedule.enabled}
          className="shrink-0 ml-4 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {trigger.isPending ? "Triggering..." : "Run Now"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
        <span>
          <span className="font-medium text-gray-600">Frequency:</span>{" "}
          {cronToHuman(schedule.schedule)}
        </span>
        <span>
          <span className="font-medium text-gray-600">Cron:</span>{" "}
          <code className="bg-gray-50 px-1 rounded">{schedule.schedule}</code>
        </span>
        {schedule.nextExecution && (
          <span>
            <span className="font-medium text-gray-600">Next:</span>{" "}
            {new Date(schedule.nextExecution).toLocaleString()}
          </span>
        )}
      </div>
      {trigger.isSuccess && trigger.data.jobId && (
        <div className="mt-2 text-xs text-green-600">
          Job triggered:{" "}
          <code className="bg-green-50 px-1 rounded">
            {trigger.data.jobId}
          </code>
        </div>
      )}
      {trigger.isSuccess && !trigger.data.jobId && (
        <div className="mt-2 text-xs text-yellow-600">
          {trigger.data.message}
        </div>
      )}
      {trigger.isError && (
        <div className="mt-2 text-xs text-red-600">
          Error: {(trigger.error as Error).message}
        </div>
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

  const { state, runs, activeJobs, completedJobs, schedules } =
    overview.data ?? {
      state: [],
      runs: [],
      activeJobs: [],
      completedJobs: [],
      schedules: [],
    };

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
      {/* Page Header + Status */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Ingest Pipeline
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Fitbit data is ingested into the database via two Windmill
            schedules. Both run the same script with 10 data types — the{" "}
            <strong>Daily Sync</strong> keeps data current, while the{" "}
            <strong>Backfill</strong> catches up on historical data (disable
            it once all progress bars are complete).
          </p>
        </div>
        <DbStatusIndicator />
      </div>

      {/* Backfill Estimate */}
      <BackfillEstimateCard
        state={state}
        runs={runs}
        completedJobs={completedJobs}
      />

      {/* Schedules */}
      <div className="space-y-3">
        {schedules.map((s) => (
          <ScheduleCard key={s.path} schedule={s} />
        ))}
        {schedules.length === 0 && !overview.isLoading && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-400">
              No schedules found in Windmill.
            </p>
          </div>
        )}
      </div>

      {/* Active / Queued Jobs */}
      {activeJobs.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-medium text-blue-800 mb-3">
            Active & Queued Jobs ({activeJobs.length})
          </h3>
          <div className="space-y-2">
            {activeJobs.map((job) => {
              const source = scheduleLabel(job.schedulePath);
              return (
                <div
                  key={job.id}
                  className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-blue-100"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        job.running
                          ? "bg-blue-500 animate-pulse"
                          : "bg-yellow-400"
                      }`}
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {job.running ? "Running" : "Queued"}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${source.color}`}
                    >
                      {source.label}
                    </span>
                    <code className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                      {job.id.slice(0, 8)}
                    </code>
                  </div>
                  <div className="text-xs text-gray-500">
                    {job.running && job.startedAt && (
                      <span>
                        started{" "}
                        {new Date(job.startedAt).toLocaleTimeString()}
                      </span>
                    )}
                    {!job.running && job.scheduledFor && (
                      <span>
                        scheduled for{" "}
                        {new Date(job.scheduledFor).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Backfill Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 mb-1">
          Backfill Progress
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Each data type is being backfilled to 365 days of history. Range
          types (HRV, SpO2, etc.) use efficient 30-day batch requests. Once
          all reach 100%, disable the backfill schedule.
        </p>
        {(() => {
          const DAILY = ["activity", "sleep", "heart_rate", "body_weight"];
          const RANGE = ["spo2", "hrv", "breathing_rate", "skin_temp", "vo2_max"];
          const PAGINATED = ["exercise_log"];
          const ALL_KNOWN = [...DAILY, ...RANGE, ...PAGINATED];
          const SCOPE_NAMES: Record<string, string> = {
            spo2: "oxygen_saturation",
            breathing_rate: "respiratory_rate",
            skin_temp: "temperature",
            vo2_max: "cardio_fitness",
          };

          // Types present in state
          const stateByType = Object.fromEntries(
            state.map((s) => [s.dataType, s]),
          );
          // Types that are known but have no state row yet (never fetched or 403)
          const missingTypes = ALL_KNOWN.filter(
            (t) => !stateByType[t],
          );

          const renderBar = (s: IngestState) => {
            const earliest = s.earliestFetchedDate
              ? new Date(s.earliestFetchedDate)
              : null;
            const latest = s.latestFetchedDate
              ? new Date(s.latestFetchedDate)
              : null;
            const daysFetched =
              earliest && latest
                ? Math.round(
                    (latest.getTime() - earliest.getTime()) / 86_400_000,
                  )
                : 0;
            const pct = Math.min(
              100,
              Math.round((daysFetched / 365) * 100),
            );

            return (
              <div key={s.dataType}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {s.dataType.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-gray-500">
                    {s.backfillComplete ? (
                      <span className="text-green-600 font-medium">
                        Complete
                      </span>
                    ) : (
                      `${pct}% (${daysFetched}/365 days)`
                    )}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      s.backfillComplete ? "bg-green-500" : "bg-blue-500"
                    }`}
                    style={{
                      width: `${s.backfillComplete ? 100 : pct}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {s.earliestFetchedDate ?? "—"} to{" "}
                  {s.latestFetchedDate ?? "—"}
                  {s.lastSuccessAtUtc && (
                    <>
                      {" · "}
                      Last success:{" "}
                      {new Date(s.lastSuccessAtUtc).toLocaleString()}
                    </>
                  )}
                </div>
              </div>
            );
          };

          const groupState = (types: string[]) =>
            types
              .map((t) => stateByType[t])
              .filter((s): s is IngestState => s != null);

          const dailyState = groupState(DAILY);
          const rangeState = groupState(RANGE);
          const paginatedState = groupState(PAGINATED);
          const scopeMissing = missingTypes.filter(
            (t) => SCOPE_NAMES[t],
          );

          return (
            <div className="space-y-5">
              {/* Daily types */}
              {dailyState.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Daily Types
                    </span>
                    <span className="text-xs text-gray-300">
                      1 API call per day per type
                    </span>
                  </div>
                  <div className="space-y-4">
                    {dailyState.map(renderBar)}
                  </div>
                </div>
              )}

              {/* Range types */}
              {rangeState.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Range Types
                    </span>
                    <span className="text-xs text-gray-300">
                      1 API call per 30 days
                    </span>
                  </div>
                  <div className="space-y-4">
                    {rangeState.map(renderBar)}
                  </div>
                </div>
              )}

              {/* Paginated types */}
              {paginatedState.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Paginated Types
                    </span>
                    <span className="text-xs text-gray-300">
                      100 items per API call
                    </span>
                  </div>
                  <div className="space-y-4">
                    {paginatedState.map(renderBar)}
                  </div>
                </div>
              )}

              {/* OAuth scope warning */}
              {scopeMissing.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span className="text-yellow-500 text-sm mt-0.5">&#9888;</span>
                    <div>
                      <p className="text-xs font-medium text-yellow-800">
                        Missing OAuth scopes
                      </p>
                      <p className="text-xs text-yellow-700 mt-0.5">
                        The following data types need additional Fitbit OAuth
                        authorization. Re-authorize your app with these scopes:{" "}
                        {scopeMissing.map((t) => (
                          <code
                            key={t}
                            className="bg-yellow-100 px-1 rounded mx-0.5"
                          >
                            {SCOPE_NAMES[t]}
                          </code>
                        ))}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {state.length === 0 && (
                <p className="text-sm text-gray-400">
                  No ingest state data yet.
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Job History */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-medium text-gray-500 mb-1">
          Job History
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Click a row to see per-data-type details. Rows and errors come from
          the database; source and timing from Windmill.
        </p>
        <div className="space-y-1">
          {completedJobs.map((job) => {
            const source = scheduleLabel(job.schedulePath);
            const dbRun = findMatchingRun(job.startedAt, runs);
            const isExpanded = expandedJobs.has(job.id);
            const hasDetails =
              dbRun?.details && Object.keys(dbRun.details).length > 0;

            return (
              <div key={job.id}>
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(job.id)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg flex items-center gap-4 transition-colors ${
                    isExpanded ? "bg-gray-100" : "hover:bg-gray-50"
                  }`}
                >
                  {/* Expand indicator */}
                  <span
                    className={`text-gray-400 text-xs transition-transform ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  >
                    ▶
                  </span>

                  {/* Source badge */}
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${source.color}`}
                  >
                    {source.label}
                  </span>

                  {/* Timestamp */}
                  <span className="text-sm text-gray-600 w-44 shrink-0">
                    {job.startedAt
                      ? new Date(job.startedAt).toLocaleString()
                      : "—"}
                  </span>

                  {/* Duration */}
                  <span className="text-sm text-gray-500 w-16 shrink-0">
                    {job.durationMs != null
                      ? formatDuration(job.durationMs)
                      : "—"}
                  </span>

                  {/* Status */}
                  <span className="w-20 shrink-0">
                    {job.isSkipped ? (
                      <span className="text-xs font-medium text-gray-400">
                        Skipped
                      </span>
                    ) : dbRun ? (
                      <StatusBadge status={dbRun.status} />
                    ) : job.success ? (
                      <span className="text-xs font-medium text-green-600">
                        Success
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-red-600">
                        Failed
                      </span>
                    )}
                  </span>

                  {/* Summary stats */}
                  <span className="text-sm text-gray-600 ml-auto flex items-center gap-3">
                    {dbRun ? (
                      <>
                        <span>
                          <span className="font-medium">
                            {dbRun.rowsWritten ?? 0}
                          </span>{" "}
                          <span className="text-gray-400">rows</span>
                        </span>
                        {(dbRun.errorCount ?? 0) > 0 && (
                          <span className="text-red-500">
                            {dbRun.errorCount} error
                            {(dbRun.errorCount ?? 0) > 1 ? "s" : ""}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {job.success ? "no DB data" : "—"}
                      </span>
                    )}
                  </span>

                  {/* Job ID */}
                  <code className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded shrink-0">
                    {job.id.slice(0, 8)}
                  </code>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="ml-9 mr-4 mt-1 mb-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                    {hasDetails ? (
                      <DetailBreakdown details={dbRun!.details!} />
                    ) : dbRun ? (
                      <p className="text-xs text-gray-400 italic">
                        Run #{dbRun.ingestRunId} — no per-type breakdown
                        available.
                      </p>
                    ) : job.success ? (
                      <p className="text-xs text-gray-400 italic">
                        Windmill job completed successfully but no matching
                        database run found. The job may have written to a
                        different database.
                      </p>
                    ) : (
                      <p className="text-xs text-red-400 italic">
                        Job failed before writing any data. Check Windmill
                        logs for job {job.id.slice(0, 12)}...
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {completedJobs.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-400">
              No completed jobs yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
