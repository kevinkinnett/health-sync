export interface HealthDataProvenance {
  /** Physical product that measured the signal. */
  device: "fitbit";
  deviceLabel: "Fitbit device";
  /** Transport/API used to import the signal into Vitalis. */
  provider: "google_health";
  providerLabel: "Google Health";
}

export type IngestFreshnessStatus = "healthy" | "stale" | "unknown";

export interface IngestFreshness {
  status: IngestFreshnessStatus;
  lastSuccessAtUtc: string | null;
  expectedIntervalMinutes: number;
  staleAfterMinutes: number;
}

export interface IngestStatus {
  provenance: HealthDataProvenance;
  freshness: IngestFreshness;
}

export type MetricCoverageStatus =
  | "target_met"
  | "provider_limited"
  | "incomplete"
  | "no_data";

export interface MetricCoverage {
  status: MetricCoverageStatus;
  daysCovered: number;
  targetDays: number;
  /** Human-readable explanation when the provider exposes a shorter window. */
  limitation: string | null;
}

export type MetricCadence = "daily" | "sparse";
export type MetricFreshnessStatus = "fresh" | "stale" | "sparse" | "unknown";

export interface MetricFreshness {
  status: MetricFreshnessStatus;
  cadence: MetricCadence;
  ageDays: number | null;
  /** Null for sparse, user-recorded measurements. */
  staleAfterDays: number | null;
}

export interface IngestState {
  dataType: string;
  latestFetchedDate: string | null;
  earliestFetchedDate: string | null;
  historyTargetMet: boolean;
  lastSuccessAtUtc: string | null;
  lastRunId: number | null;
  updatedAtUtc: string | null;
  /** Provider-aware historical coverage policy. */
  coverage?: MetricCoverage;
  /** Per-metric freshness; distinct from the four-hour pipeline heartbeat. */
  metricFreshness?: MetricFreshness;
}

export interface IngestRunTypeDetail {
  rows: number;
  errors: number;
  range: string;
}

export interface IngestRun {
  ingestRunId: number;
  startedAtUtc: string;
  finishedAtUtc: string | null;
  status: string;
  rowsWritten: number | null;
  errorCount: number | null;
  details: Record<string, IngestRunTypeDetail> | null;
}

export interface TriggerResponse {
  jobId: string;
  message: string;
}

/** Operational role of a Windmill workflow in the health-data system. */
export type PipelineCategory = "source" | "analysis" | "notification";

export interface PipelineIdentity {
  pipelineKey: string;
  pipelineLabel: string;
  pipelineCategory: PipelineCategory;
}

/** A Windmill job that is either queued or currently running. */
export interface WindmillJob extends PipelineIdentity {
  id: string;
  scriptPath: string;
  createdAt: string;
  startedAt: string | null;
  scheduledFor: string | null;
  running: boolean;
  schedulePath: string | null;
}

/** A completed Windmill job (for history). */
export interface WindmillCompletedJob extends PipelineIdentity {
  id: string;
  scriptPath: string;
  schedulePath: string | null;
  createdAt: string;
  startedAt: string | null;
  durationMs: number | null;
  success: boolean;
  isSkipped: boolean;
}

export interface WindmillSchedule extends PipelineIdentity {
  path: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  scriptPath: string;
  nextExecution: string | null;
  summary: string | null;
  description: string | null;
  /** Only dashboard-owned coordinators can be started from this screen. */
  triggerable: boolean;
}

export interface IngestOverview {
  status: IngestStatus;
  state: IngestState[];
  runs: IngestRun[];
  /** True only when the API reached Windmill during this overview request. */
  windmillConnected: boolean;
  activeJobs: WindmillJob[];
  completedJobs: WindmillCompletedJob[];
  schedules: WindmillSchedule[];
}
