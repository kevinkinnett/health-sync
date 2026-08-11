import type {
  IngestState,
  MetricCadence,
  MetricCoverage,
  MetricFreshness,
} from "@health-dashboard/shared";

interface MetricPolicy {
  coverageTargetDays: number;
  cadence: MetricCadence;
  staleAfterDays: number | null;
  limitation?: string;
}

const DEFAULT_POLICY: MetricPolicy = {
  coverageTargetDays: 365,
  cadence: "daily",
  staleAfterDays: 3,
};

/**
 * Provider-specific expectations live at this boundary instead of leaking
 * into repositories or React components. Google Health exposes a shorter
 * usable SpO2 window, while weight and exercise are event-driven rather than
 * measurements that should arrive every day.
 */
const GOOGLE_HEALTH_POLICIES: Record<string, MetricPolicy> = {
  activity: { ...DEFAULT_POLICY, staleAfterDays: 2 },
  sleep: { ...DEFAULT_POLICY, staleAfterDays: 2 },
  heart_rate: { ...DEFAULT_POLICY, staleAfterDays: 2 },
  body_weight: {
    coverageTargetDays: 365,
    cadence: "sparse",
    staleAfterDays: null,
  },
  spo2: {
    coverageTargetDays: 90,
    cadence: "daily",
    staleAfterDays: 3,
    limitation: "Google Health exposes the available device history for SpO₂ rather than the full 365-day archive.",
  },
  hrv: DEFAULT_POLICY,
  breathing_rate: DEFAULT_POLICY,
  skin_temp: DEFAULT_POLICY,
  exercise_log: {
    coverageTargetDays: 365,
    cadence: "sparse",
    staleAfterDays: null,
  },
};

const MS_PER_DAY = 86_400_000;

function dateMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function daysCovered(state: IngestState): number {
  const earliest = dateMs(state.earliestFetchedDate);
  const latest = dateMs(state.latestFetchedDate);
  if (earliest == null || latest == null) return 0;
  return Math.max(0, Math.round((latest - earliest) / MS_PER_DAY));
}

export function evaluateMetricCoverage(state: IngestState): MetricCoverage {
  const policy = GOOGLE_HEALTH_POLICIES[state.dataType] ?? DEFAULT_POLICY;
  const covered = daysCovered(state);
  if (!state.earliestFetchedDate || !state.latestFetchedDate) {
    return {
      status: "no_data",
      daysCovered: 0,
      targetDays: policy.coverageTargetDays,
      limitation: policy.limitation ?? null,
    };
  }
  if (covered >= policy.coverageTargetDays) {
    return {
      status: policy.limitation ? "provider_limited" : "target_met",
      daysCovered: covered,
      targetDays: policy.coverageTargetDays,
      limitation: policy.limitation ?? null,
    };
  }
  return {
    status: "incomplete",
    daysCovered: covered,
    targetDays: policy.coverageTargetDays,
    limitation: policy.limitation ?? null,
  };
}

export function evaluateMetricFreshness(
  state: IngestState,
  nowMs = Date.now(),
): MetricFreshness {
  const policy = GOOGLE_HEALTH_POLICIES[state.dataType] ?? DEFAULT_POLICY;
  const latest = dateMs(state.latestFetchedDate);
  const ageDays = latest == null
    ? null
    : Math.max(0, Math.floor((nowMs - latest) / MS_PER_DAY));

  if (policy.cadence === "sparse") {
    return {
      status: "sparse",
      cadence: policy.cadence,
      ageDays,
      staleAfterDays: null,
    };
  }
  if (ageDays == null) {
    return {
      status: "unknown",
      cadence: policy.cadence,
      ageDays: null,
      staleAfterDays: policy.staleAfterDays,
    };
  }
  return {
    status: ageDays > (policy.staleAfterDays ?? 0) ? "stale" : "fresh",
    cadence: policy.cadence,
    ageDays,
    staleAfterDays: policy.staleAfterDays,
  };
}

export function applyIngestPolicies(
  state: IngestState[],
  nowMs = Date.now(),
): IngestState[] {
  return state.map((item) => ({
    ...item,
    coverage: evaluateMetricCoverage(item),
    metricFreshness: evaluateMetricFreshness(item, nowMs),
  }));
}
