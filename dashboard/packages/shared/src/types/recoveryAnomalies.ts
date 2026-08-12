import type { ReadinessMetric, ReadinessSourceProvenance } from "./readiness.js";

/** Versioned, provider-neutral daily recovery feature used by anomaly analysis. */
export interface RecoveryFeatureSource {
  provenance: ReadinessSourceProvenance;
  value: number;
  expected: number;
  /** Natural-direction robust deviation: positive means the raw value is higher. */
  z: number;
  measurement: string;
  regime: string;
  baselineDays: number;
}

export type RecoveryFeatureImpact = "better" | "worse" | "neutral";

export interface RecoveryFeature {
  metric: ReadinessMetric;
  label: string;
  unit: string;
  /** Fused raw value only when source definitions are directly comparable. */
  value: number | null;
  expected: number | null;
  /** Signed so positive always means better recovery. */
  recoveryZ: number;
  impact: RecoveryFeatureImpact;
  sources: RecoveryFeatureSource[];
}

export type RecoveryAnomalySeverity = "watch" | "notable" | "strong";
export type RecoveryAnomalyDirection = "worse" | "better" | "mixed";

export interface RecoveryAnomalyDay {
  date: string;
  /** 0-100 unusualness strength; not a wellness or medical-risk score. */
  score: number;
  severity: RecoveryAnomalySeverity;
  direction: RecoveryAnomalyDirection;
  summary: string;
  coveragePct: number;
  features: RecoveryFeature[];
}

export interface RecoveryAnomalyReport {
  methodVersion: string;
  timezone: string;
  baselineWindowDays: number;
  minimumBaselineDays: number;
  window: { start: string; end: string };
  excludedCurrentDate: string;
  daysAnalyzed: number;
  unusualDays: RecoveryAnomalyDay[];
  caveats: string[];
}
