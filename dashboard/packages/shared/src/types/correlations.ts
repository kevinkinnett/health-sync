import type { PersonalEvidenceGrade } from "./evidence.js";

export interface CorrelationPair {
  xMetric: string;
  yMetric: string;
  xLabel: string;
  yLabel: string;
  correlation: number;
  points: { x: number; y: number; date: string }[];
  insight: string;
  /**
   * Day offset between the two series: y is sampled `lagDays` days AFTER
   * x (0/omitted = same-day pair). Lag-1 pairs answer "does today's X
   * affect tomorrow's Y?" — e.g. time in car today vs next-day readiness.
   * `points[].date` is always the X day.
   */
  lagDays?: number;
  /** Rank-based association, less sensitive to outliers and curvature. */
  spearman?: number;
  /** Moving-block bootstrap interval for Pearson r. */
  confidenceInterval?: { low: number; high: number };
  /** Whether the relationship keeps a similar direction across time. */
  stability?: "stable" | "mixed" | "unstable";
  /** Benjamini-Hochberg adjusted circular-shift test probability. */
  adjustedPValue?: number;
  /** Conservative headline gate after correction and stability checks. */
  notableAfterCorrection?: boolean;
  evidence: PersonalEvidenceGrade;
}

export interface ActivityBucket {
  label: string;
  days: number;
  avgSleepMin: number;
  avgDeepMin: number;
  avgEfficiency: number;
}

export interface CorrelationsData {
  pairs: CorrelationPair[];
  activitySleepBuckets: ActivityBucket[];
  dataPoints: number;
  /** The completed local-day window actually represented by the series. */
  window?: { start: string | null; end: string | null };
  /** Current local date deliberately omitted because it may still be partial. */
  excludedCurrentDate?: string;
  /** Latest like-for-like measurement regimes used for regime-sensitive signals. */
  measurementRegimes?: {
    sleep: string | null;
    hrv: string | null;
  };
}

export type WorkoutEffectExposure = "all" | "strength" | "cardio" | "walk" | "chore" | "other";
export type WorkoutEffectOutcome =
  | "sleep_duration"
  | "sleep_efficiency"
  | "resting_heart_rate"
  | "hrv"
  | "restlessness";
export type WorkoutEffectConclusion = "helped" | "cost" | "unclear";
export type WorkoutEffectConfidence = "limited" | "moderate" | "high";

/**
 * A within-person matched-day estimate. This is adjusted observational
 * evidence, never a claim that exercise was randomized or proved causal.
 */
export interface WorkoutEffectEstimate {
  exposure: WorkoutEffectExposure;
  exposureLabel: string;
  outcome: WorkoutEffectOutcome;
  outcomeLabel: string;
  unit: string;
  betterDirection: "up" | "down";
  workoutDays: number;
  matchedRestDays: number;
  workoutMean: number;
  matchedRestMean: number;
  /** Workout mean minus matched-rest mean, in the outcome's real unit. */
  adjustedDifference: number;
  confidenceInterval: { low: number; high: number };
  standardizedDifference: number | null;
  conclusion: WorkoutEffectConclusion;
  confidence: WorkoutEffectConfidence;
  evidence: PersonalEvidenceGrade;
  interpretation: string;
}

export interface WorkoutEffectsData {
  methodVersion: string;
  timezone: string;
  window: { start: string | null; end: string | null };
  sessions: number;
  workoutDays: number;
  effects: WorkoutEffectEstimate[];
  matching: {
    weekdayMatched: true;
    maximumDayDistance: number;
    covariates: string[];
  };
  caveats: string[];
}
