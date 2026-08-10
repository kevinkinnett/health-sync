/**
 * "Readiness" / recovery score — a single 0–100 number answering "how
 * recovered is my body today", synthesized from the overnight recovery
 * signals vs the user's OWN trailing baseline (50 = exactly at your
 * baseline). See `services/readiness.ts` for the methodology.
 */

export type ReadinessBand =
  | "primed" // clearly above baseline — good day to push
  | "balanced" // around baseline
  | "compromised" // clearly below baseline — ease off
  | "insufficient"; // not enough data to score

export type ReadinessComponentStatus =
  | "good"
  | "neutral"
  | "poor"
  | "unavailable";

export type ReadinessMetric =
  | "hrv"
  | "rhr"
  | "sleep"
  | "breathing"
  | "spo2"
  | "skinTemp"
  | "restlessness";

export type ReadinessDevice = "fitbit" | "eight_sleep";
export type ReadinessProvider = "google_health" | "eight_sleep";

export interface ReadinessSourceProvenance {
  device: ReadinessDevice;
  deviceLabel: string;
  provider: ReadinessProvider;
  providerLabel: string;
}

/** One sensor's signed-z contribution to a fused component. */
export interface ReadinessComponentSource {
  /** Device and ingestion provider are distinct so transport changes do not
   * erase the physical sensor's analytical identity. */
  provenance: ReadinessSourceProvenance;
  /** Signed z (positive = better recovery), this source alone. */
  z: number;
}

export interface ReadinessComponent {
  metric: ReadinessMetric;
  label: string;
  /** Today's raw value (ms, bpm, min, br/min, %, °). */
  value: number | null;
  /** Trailing baseline mean for this metric (null for skin temp, which
   *  is already a baseline-relative deviation). */
  baseline: number | null;
  /** Standardized deviation, SIGNED so positive always means "better
   *  recovery" regardless of the metric's natural direction. */
  z: number | null;
  /** Approximate points this metric pushed the composite away from 50. */
  contribution: number;
  /** This metric's weight in the composite, as a percentage. */
  weightPct: number;
  status: ReadinessComponentStatus;
  /** Per-sensor breakdown for fused metrics (HRV/RHR/etc). Omitted for
   *  single-source metrics' callers that don't populate it. */
  sources?: ReadinessComponentSource[];
  /** True when ≥2 sensors measured this and disagreed materially. */
  disagreement?: boolean;
}

/** One day's score, for the trend sparkline. */
export interface ReadinessPoint {
  date: string;
  score: number;
}

export interface ReadinessScore {
  /** The day actually scored (latest with core data), or null. */
  date: string | null;
  /** 0–100, 50 = at baseline. Null when `band === "insufficient"`. */
  score: number | null;
  band: ReadinessBand;
  /** One-line plain-English read of the day. */
  summary: string;
  /** How many days of history the baseline was computed from. */
  baselineDays: number;
  components: ReadinessComponent[];
  /** Recent daily scores (oldest→newest) for a trend sparkline. */
  history: ReadinessPoint[];
}
