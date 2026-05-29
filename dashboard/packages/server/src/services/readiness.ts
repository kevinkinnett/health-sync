import type {
  ReadinessBand,
  ReadinessComponent,
  ReadinessMetric,
  ReadinessScore,
} from "@health-dashboard/shared";

/**
 * Personal readiness / recovery score.
 *
 * Philosophy: "good HRV" is personal, not an absolute threshold — so
 * every signal is scored as a z-deviation from the user's OWN trailing
 * baseline, not against population norms. 50 = exactly at your
 * baseline; above means better-recovered-than-usual, below means worse.
 *
 * Per metric, per day:
 *   1. baseline = mean/std over the trailing BASELINE_DAYS (excluding
 *      the scored day), requiring ≥ MIN_BASELINE_DAYS valid points.
 *   2. z = clamp((today − mean) / std, ±Z_CLAMP).
 *   3. signed so + always means "more recovered" (HRV up = good → +z;
 *      RHR up = bad → −z; etc).
 * Then weight, renormalize over the metrics actually present, and map
 * the weighted z through tanh to a bounded 0–100.
 *
 * HRV and resting HR are the heavyweights (consistent with how Whoop /
 * Oura / Garmin weight recovery); sleep is moderate; breathing, SpO2,
 * and skin-temp act mostly as flags that subtract when abnormal. All
 * weights/windows are tunable constants below.
 *
 * This module is PURE (no DB, no clock) so the math is unit-testable
 * with synthetic series.
 */

// ---- Tunables -------------------------------------------------------------

const BASELINE_DAYS = 30;
const MIN_BASELINE_DAYS = 10;
const Z_CLAMP = 3;
/** Larger = flatter mapping (a given z moves the score less). */
const TANH_SCALE = 1.5;
/** Days of trailing score history returned for the sparkline. */
const HISTORY_DAYS = 14;

/** Relative weights; renormalized over whichever metrics are present. */
const WEIGHTS: Record<ReadinessMetric, number> = {
  hrv: 35,
  rhr: 25,
  sleep: 15,
  breathing: 10,
  spo2: 8,
  skinTemp: 7,
};

/** +1 = higher is better-recovered, −1 = lower is better. skinTemp is
 *  handled specially (deviation from 0, penalty-only). */
const DIRECTION: Record<Exclude<ReadinessMetric, "skinTemp">, 1 | -1> = {
  hrv: 1,
  rhr: -1,
  sleep: 1,
  breathing: -1,
  spo2: 1,
};

const LABELS: Record<ReadinessMetric, string> = {
  hrv: "HRV",
  rhr: "Resting HR",
  sleep: "Sleep",
  breathing: "Breathing rate",
  spo2: "Blood oxygen",
  skinTemp: "Skin temp",
};

const ROLLING_METRICS = ["hrv", "rhr", "sleep", "breathing", "spo2"] as const;

// ---- Inputs ---------------------------------------------------------------

export interface ReadinessDayInput {
  date: string;
  hrv: number | null;
  rhr: number | null;
  sleepMin: number | null;
  breathing: number | null;
  spo2: number | null;
  /** Already a baseline-relative deviation (degrees, + = warmer). */
  skinTemp: number | null;
}

// ---- Helpers --------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function meanStd(values: number[]): { mean: number; std: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function valueOf(d: ReadinessDayInput, m: ReadinessMetric): number | null {
  switch (m) {
    case "hrv":
      return d.hrv;
    case "rhr":
      return d.rhr;
    case "sleep":
      return d.sleepMin;
    case "breathing":
      return d.breathing;
    case "spo2":
      return d.spo2;
    case "skinTemp":
      return d.skinTemp;
  }
}

function bandFor(score: number): ReadinessBand {
  if (score >= 66) return "primed";
  if (score >= 40) return "balanced";
  return "compromised";
}

function statusFor(signedZ: number): ReadinessComponent["status"] {
  if (signedZ >= 0.5) return "good";
  if (signedZ <= -0.5) return "poor";
  return "neutral";
}

/**
 * Skin temp is already baseline-relative (≈0 = normal), so it doesn't
 * get a rolling baseline. It penalizes deviation from 0 — positive
 * (warmer, the classic illness signal) ~1.5× harder than cooler — and
 * grants a small bonus when right at baseline.
 */
function skinTempSignedZ(dev: number): number {
  const penalty = dev > 0 ? dev / 0.4 : Math.abs(dev) / 0.6;
  return clamp(0.3 - penalty, -Z_CLAMP, 0.3);
}

// ---- Single-day score -----------------------------------------------------

interface DayScore {
  score: number | null;
  band: ReadinessBand;
  components: ReadinessComponent[];
  baselineDays: number;
}

/**
 * Score the day at `idx` using the days before it as baseline. `days`
 * must be sorted ascending by date.
 */
function scoreDay(days: ReadinessDayInput[], idx: number): DayScore {
  const target = days[idx];
  const baselineWindow = days.slice(Math.max(0, idx - BASELINE_DAYS), idx);
  const components: ReadinessComponent[] = [];
  let weightedSum = 0;
  let weightTotal = 0;
  let maxBaselineDays = 0;
  let hasCore = false;

  for (const m of ROLLING_METRICS) {
    const value = valueOf(target, m);
    const baselineVals = baselineWindow
      .map((d) => valueOf(d, m))
      .filter((v): v is number => v != null);

    if (value == null || baselineVals.length < MIN_BASELINE_DAYS) {
      components.push({
        metric: m,
        label: LABELS[m],
        value,
        baseline: baselineVals.length
          ? round1(meanStd(baselineVals).mean)
          : null,
        z: null,
        contribution: 0,
        weightPct: WEIGHTS[m],
        status: "unavailable",
      });
      continue;
    }

    maxBaselineDays = Math.max(maxBaselineDays, baselineVals.length);
    const { mean, std } = meanStd(baselineVals);
    const z = std > 0 ? clamp((value - mean) / std, -Z_CLAMP, Z_CLAMP) : 0;
    const signedZ = z * DIRECTION[m];
    weightedSum += WEIGHTS[m] * signedZ;
    weightTotal += WEIGHTS[m];
    if (m === "hrv" || m === "rhr") hasCore = true;

    components.push({
      metric: m,
      label: LABELS[m],
      value: round1(value),
      baseline: round1(mean),
      z: round2(signedZ),
      contribution: 0, // filled after we know weightTotal
      weightPct: WEIGHTS[m],
      status: statusFor(signedZ),
    });
  }

  // Skin temp — no rolling baseline.
  if (target.skinTemp != null) {
    const signedZ = skinTempSignedZ(target.skinTemp);
    weightedSum += WEIGHTS.skinTemp * signedZ;
    weightTotal += WEIGHTS.skinTemp;
    components.push({
      metric: "skinTemp",
      label: LABELS.skinTemp,
      value: round2(target.skinTemp),
      baseline: 0,
      z: round2(signedZ),
      contribution: 0,
      weightPct: WEIGHTS.skinTemp,
      status: statusFor(signedZ),
    });
  } else {
    components.push({
      metric: "skinTemp",
      label: LABELS.skinTemp,
      value: null,
      baseline: 0,
      z: null,
      contribution: 0,
      weightPct: WEIGHTS.skinTemp,
      status: "unavailable",
    });
  }

  // Need at least 3 present components and at least one core signal
  // (HRV or RHR) to claim a meaningful score.
  const presentCount = components.filter((c) => c.z != null).length;
  if (!hasCore || presentCount < 3 || weightTotal === 0) {
    return { score: null, band: "insufficient", components, baselineDays: maxBaselineDays };
  }

  const weightedZ = weightedSum / weightTotal;
  const score = clamp(
    Math.round(50 + 50 * Math.tanh(weightedZ / TANH_SCALE)),
    1,
    99,
  );

  // Fill display contributions: each metric's share of the move off 50,
  // a linear approximation of its tanh attribution.
  for (const c of components) {
    if (c.z == null) continue;
    c.contribution = round1((WEIGHTS[c.metric] / weightTotal) * c.z * (50 / TANH_SCALE));
  }

  return { score, band: bandFor(score), components, baselineDays: maxBaselineDays };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---- Public entry point ---------------------------------------------------

/**
 * Compute the current readiness score plus a short trailing history.
 * `days` need not be sorted; missing days are simply absent. The scored
 * "today" is the latest day that has at least one core signal (HRV or
 * RHR) — overnight metrics land in the morning, so a half-empty current
 * row falls back to the last complete day rather than scoring as zero.
 */
export function computeReadiness(
  daysIn: ReadinessDayInput[],
): ReadinessScore {
  const days = [...daysIn].sort((a, b) => a.date.localeCompare(b.date));

  const eligible = (d: ReadinessDayInput) => d.hrv != null || d.rhr != null;
  const targetIdx = (() => {
    for (let i = days.length - 1; i >= 0; i--) {
      if (eligible(days[i])) return i;
    }
    return -1;
  })();

  if (targetIdx < 0) {
    return {
      date: null,
      score: null,
      band: "insufficient",
      summary: "Not enough recent data to compute readiness.",
      baselineDays: 0,
      components: [],
      history: [],
    };
  }

  const current = scoreDay(days, targetIdx);

  // History: score each eligible day in the trailing window that has a
  // computable score.
  const history: { date: string; score: number }[] = [];
  for (
    let i = Math.max(0, targetIdx - HISTORY_DAYS + 1);
    i <= targetIdx;
    i++
  ) {
    if (!eligible(days[i])) continue;
    const s = scoreDay(days, i);
    if (s.score != null) history.push({ date: days[i].date, score: s.score });
  }

  return {
    date: days[targetIdx].date,
    score: current.score,
    band: current.band,
    summary: summarize(current),
    baselineDays: current.baselineDays,
    components: current.components,
    history,
  };
}

function summarize(s: DayScore): string {
  if (s.score == null) {
    return "Not enough baseline history yet — keep syncing to unlock readiness.";
  }
  const scored = s.components.filter((c) => c.z != null);
  const best = [...scored].sort((a, b) => (b.z ?? 0) - (a.z ?? 0))[0];
  const worst = [...scored].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))[0];
  const lead =
    s.band === "primed"
      ? "Primed"
      : s.band === "compromised"
        ? "Compromised"
        : "Balanced";
  const parts: string[] = [];
  if (best && (best.z ?? 0) >= 0.5) {
    parts.push(`${best.label.toLowerCase()} above your baseline`);
  }
  if (worst && (worst.z ?? 0) <= -0.5) {
    parts.push(`${worst.label.toLowerCase()} below`);
  }
  if (parts.length === 0) return `${lead} — everything close to your baseline.`;
  return `${lead} — ${parts.join(", ")}.`;
}
