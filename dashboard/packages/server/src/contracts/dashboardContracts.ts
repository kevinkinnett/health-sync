import { z } from "zod";

const sparklinePointSchema = z.object({
  date: z.string(),
  value: z.number().nullable(),
});

const summaryDomainSchema = z.object({
  // Domain records have their own detailed contracts. At this boundary the
  // safety-critical guarantee is that every dashboard domain and its trend
  // exist together; passthrough preserves the typed repository record.
  latest: z.unknown().nullable(),
  sparkline: z.array(sparklinePointSchema),
});

export const healthSummaryResponseSchema = z.object({
  activity: summaryDomainSchema,
  sleep: summaryDomainSchema,
  heartRate: summaryDomainSchema,
  weight: summaryDomainSchema,
});

const readinessProvenanceSchema = z.object({
  device: z.enum(["fitbit", "eight_sleep"]),
  deviceLabel: z.string().min(1),
  provider: z.enum(["google_health", "eight_sleep"]),
  providerLabel: z.string().min(1),
});

const readinessSourceSchema = z.object({
  // `label` is deliberately required during the compatibility window: old
  // cached clients read it while current clients use structured provenance.
  label: z.string().min(1),
  provenance: readinessProvenanceSchema,
  z: z.number(),
});

const readinessComponentSchema = z.object({
  metric: z.enum(["hrv", "rhr", "sleep", "breathing", "spo2", "skinTemp", "restlessness"]),
  label: z.string(),
  value: z.number().nullable(),
  baseline: z.number().nullable(),
  z: z.number().nullable(),
  contribution: z.number(),
  weightPct: z.number(),
  status: z.enum(["good", "neutral", "poor", "unavailable"]),
  sources: z.array(readinessSourceSchema).optional(),
  disagreement: z.boolean().optional(),
});

export const readinessResponseSchema = z.object({
  date: z.string().nullable(),
  score: z.number().min(0).max(100).nullable(),
  band: z.enum(["primed", "balanced", "compromised", "insufficient"]),
  summary: z.string(),
  baselineDays: z.number().int().nonnegative(),
  components: z.array(readinessComponentSchema),
  history: z.array(z.object({ date: z.string(), score: z.number().min(0).max(100) })),
});

export const ingestStatusResponseSchema = z.object({
  provenance: z.object({
    device: z.literal("fitbit"),
    deviceLabel: z.literal("Fitbit device"),
    provider: z.literal("google_health"),
    providerLabel: z.literal("Google Health"),
  }),
  freshness: z.object({
    status: z.enum(["healthy", "stale", "unknown"]),
    lastSuccessAtUtc: z.string().datetime().nullable(),
    expectedIntervalMinutes: z.number().positive(),
    staleAfterMinutes: z.number().positive(),
  }),
});

const ingestStateSchema = z.object({
  dataType: z.string(),
  latestFetchedDate: z.string().nullable(),
  earliestFetchedDate: z.string().nullable(),
  historyTargetMet: z.boolean(),
  lastSuccessAtUtc: z.string().nullable(),
  lastRunId: z.number().int().nullable(),
  updatedAtUtc: z.string().nullable(),
  coverage: z.object({
    status: z.enum(["target_met", "provider_limited", "incomplete", "no_data"]),
    daysCovered: z.number().int().nonnegative(),
    targetDays: z.number().int().positive(),
    limitation: z.string().nullable(),
  }),
  metricFreshness: z.object({
    status: z.enum(["fresh", "stale", "sparse", "unknown"]),
    cadence: z.enum(["daily", "sparse"]),
    ageDays: z.number().int().nonnegative().nullable(),
    staleAfterDays: z.number().int().positive().nullable(),
  }),
});

const ingestRunSchema = z.object({
  ingestRunId: z.number().int(),
  startedAtUtc: z.string(),
  finishedAtUtc: z.string().nullable(),
  status: z.string(),
  rowsWritten: z.number().int().nullable(),
  errorCount: z.number().int().nullable(),
  details: z.record(z.object({ rows: z.number(), errors: z.number(), range: z.string() })).nullable(),
});

export const ingestOverviewResponseSchema = z.object({
  status: ingestStatusResponseSchema,
  state: z.array(ingestStateSchema),
  runs: z.array(ingestRunSchema),
  windmillConnected: z.boolean(),
  activeJobs: z.array(z.object({
    id: z.string(), scriptPath: z.string(), createdAt: z.string(),
    startedAt: z.string().nullable(), scheduledFor: z.string().nullable(),
    running: z.boolean(), schedulePath: z.string().nullable(),
  })),
  completedJobs: z.array(z.object({
    id: z.string(), scriptPath: z.string(), schedulePath: z.string().nullable(),
    createdAt: z.string(), startedAt: z.string().nullable(), durationMs: z.number().nullable(),
    success: z.boolean(), isSkipped: z.boolean(),
  })),
  schedules: z.array(z.object({
    path: z.string(), schedule: z.string(), enabled: z.boolean(), scriptPath: z.string(),
    nextExecution: z.string().nullable(), summary: z.string().nullable(), description: z.string().nullable(),
  })),
});
