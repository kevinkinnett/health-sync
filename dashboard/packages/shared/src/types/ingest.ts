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

export interface IngestState {
  dataType: string;
  latestFetchedDate: string | null;
  earliestFetchedDate: string | null;
  historyTargetMet: boolean;
  lastSuccessAtUtc: string | null;
  lastRunId: number | null;
  updatedAtUtc: string | null;
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

/** A Windmill job that is either queued or currently running. */
export interface WindmillJob {
  id: string;
  scriptPath: string;
  createdAt: string;
  startedAt: string | null;
  scheduledFor: string | null;
  running: boolean;
  schedulePath: string | null;
}

/** A completed Windmill job (for history). */
export interface WindmillCompletedJob {
  id: string;
  scriptPath: string;
  schedulePath: string | null;
  createdAt: string;
  startedAt: string | null;
  durationMs: number | null;
  success: boolean;
  isSkipped: boolean;
}

export interface WindmillSchedule {
  path: string;
  schedule: string;
  enabled: boolean;
  scriptPath: string;
  nextExecution: string | null;
  summary: string | null;
  description: string | null;
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
