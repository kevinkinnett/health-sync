import type {
  ReadinessBand,
  ReadinessComponent,
  ReadinessMetric,
  ReadinessScore,
} from "@health-dashboard/shared";
import {
  fuseMetric,
  type FusibleMetric,
  type ReadinessSource,
  type SourceValues,
} from "./signalFusion.js";

/**
 * Personal readiness / recovery score.
 *
 * Philosophy: "good HRV" is personal, not an absolute threshold — so
 * every signal is scored as a z-deviation from the user's OWN trailing
 * baseline, not against population norms. 50 = exactly at your baseline.
 *
 * HOLISTIC FUSION: signals measured by more than one device (HRV, resting
 * HR, breathing, sleep) are scored per-source against each source's own
 * baseline, then fused (see `signalFusion.ts`). Neither sensor trumps the
 * other — they're weighted by how much real signal each carries for that
 * metric, then averaged. A signal with only one source present just uses
 * that source. SpO2 + skin temp are Fitbit-only; restlessness is Eight
 * Sleep-only.
 *
 * Per metric, per day: fused z → signed (+ always = "more recovered") →
 * weighted, renormalized over present metrics → tanh → 0–100.
 *
 * PURE (no DB, no clock) so the math is unit-testable with synthetic series.
 */

// ---- Tunables -------------------------------------------------------------

const BASELINE_DAYS = 30;
const MIN_BASELINE_DAYS = 10;
const Z_CLAMP = 3;
const TANH_SCALE = 1.5;
const HISTORY_DAYS = 14;

const WEIGHTS: Record<ReadinessMetric, number> = {
  hrv: 35,
  rhr: 25,
  sleep: 15,
  breathing: 10,
  spo2: 8,
  skinTemp: 7,
  restlessness: 5,
};

/** +1 = higher is better-recovered, −1 = lower is better. */
const DIRECTION: Record<FusibleMetric, 1 | -1> = {
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
  restlessness: "Restlessness",
};

/** Fusible (multi-source) rolling metrics + the input field they map to. */
const FUSIBLE: { metric: FusibleMetric; field: keyof ReadinessDayInput }[] = [
  { metric: "hrv", field: "hrv" },
  { metric: "rhr", field: "rhr" },
  { metric: "sleep", field: "sleepMin" },
  { metric: "breathing", field: "breathing" },
  { metric: "spo2", field: "spo2" },
];

// ---- Inputs ---------------------------------------------------------------

export interface ReadinessDayInput {
  date: string;
  /** Per-source raw values for the fusible signals. */
  hrv: SourceValues;
  rhr: SourceValues;
  sleepMin: SourceValues;
  breathing: SourceValues;
  spo2: SourceValues;
  /** Fitbit-only, already a baseline-relative deviation (°, + = warmer). */
  skinTemp: number | null;
  /** Eight Sleep-only toss-and-turn count (higher = more restless). */
  restlessness: number | null;
}

// ---- Helpers --------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function meanStd(values: number[]): { mean: number; std: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
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

/** Per-source baseline series for a fusible metric over the window. */
function windowFor(
  baselineWindow: ReadinessDayInput[],
  field: keyof ReadinessDayInput,
): Partial<Record<ReadinessSource, number[]>> {
  const out: Partial<Record<ReadinessSource, number[]>> = {};
  for (const src of ["fitbit", "eightSleep"] as ReadinessSource[]) {
    const vals: number[] = [];
    for (const d of baselineWindow) {
      const sv = d[field] as SourceValues;
      const v = sv?.[src];
      if (v != null) vals.push(v);
    }
    if (vals.length) out[src] = vals;
  }
  return out;
}

function skinTempSignedZ(dev: number): number {
  const penalty = dev > 0 ? dev / 0.4 : Math.abs(dev) / 0.6;
  return clamp(0.3 - penalty, -Z_CLAMP, 0.3);
}

function unavailable(metric: ReadinessMetric, value: number | null = null): ReadinessComponent {
  return {
    metric,
    label: LABELS[metric],
    value,
    baseline: null,
    z: null,
    contribution: 0,
    weightPct: WEIGHTS[metric],
    status: "unavailable",
  };
}

// ---- Single-day score -----------------------------------------------------

interface DayScore {
  score: number | null;
  band: ReadinessBand;
  components: ReadinessComponent[];
  baselineDays: number;
}

function scoreDay(days: ReadinessDayInput[], idx: number): DayScore {
  const target = days[idx];
  const baselineWindow = days.slice(Math.max(0, idx - BASELINE_DAYS), idx);
  const components: ReadinessComponent[] = [];
  let weightedSum = 0;
  let weightTotal = 0;
  let maxBaselineDays = 0;
  let hasCore = false;

  // --- Fusible (multi-source) metrics ---
  for (const { metric, field } of FUSIBLE) {
    const todays = target[field] as SourceValues;
    const window = windowFor(baselineWindow, field);
    const fused = fuseMetric(metric, todays, window, {
      minBaselineDays: MIN_BASELINE_DAYS,
      zClamp: Z_CLAMP,
    });

    if (fused.z == null) {
      components.push(unavailable(metric));
      continue;
    }

    maxBaselineDays = Math.max(maxBaselineDays, fused.baselineDays);
    const signedZ = fused.z * DIRECTION[metric];
    weightedSum += WEIGHTS[metric] * signedZ;
    weightTotal += WEIGHTS[metric];
    if (metric === "hrv" || metric === "rhr") hasCore = true;

    components.push({
      metric,
      label: LABELS[metric],
      value: fused.value != null ? round1(fused.value) : null,
      baseline: fused.baseline != null ? round1(fused.baseline) : null,
      z: round2(signedZ),
      contribution: 0,
      weightPct: WEIGHTS[metric],
      status: statusFor(signedZ),
      sources: fused.perSource.map((p) => ({ label: p.label, z: round2(p.z * DIRECTION[metric]) })),
      disagreement: fused.disagreement,
    });
  }

  // --- Restlessness (Eight Sleep only, penalty-leaning) ---
  {
    const todayVal = target.restlessness;
    const baseVals = baselineWindow
      .map((d) => d.restlessness)
      .filter((v): v is number => v != null);
    if (todayVal != null && baseVals.length >= MIN_BASELINE_DAYS) {
      const { mean, std } = meanStd(baseVals);
      const z = std > 0 ? clamp((todayVal - mean) / std, -Z_CLAMP, Z_CLAMP) : 0;
      // Higher restlessness is worse; cap the "calm night" bonus small.
      const signedZ = clamp(-z, -Z_CLAMP, 0.3);
      weightedSum += WEIGHTS.restlessness * signedZ;
      weightTotal += WEIGHTS.restlessness;
      maxBaselineDays = Math.max(maxBaselineDays, baseVals.length);
      components.push({
        metric: "restlessness",
        label: LABELS.restlessness,
        value: round1(todayVal),
        baseline: round1(mean),
        z: round2(signedZ),
        contribution: 0,
        weightPct: WEIGHTS.restlessness,
        status: statusFor(signedZ),
        sources: [{ label: "Eight Sleep", z: round2(signedZ) }],
      });
    } else {
      components.push(unavailable("restlessness", todayVal != null ? round1(todayVal) : null));
    }
  }

  // --- Skin temp (Fitbit only, no rolling baseline) ---
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
      sources: [{ label: "Fitbit", z: round2(signedZ) }],
    });
  } else {
    components.push({ ...unavailable("skinTemp"), baseline: 0 });
  }

  const presentCount = components.filter((c) => c.z != null).length;
  if (!hasCore || presentCount < 3 || weightTotal === 0) {
    return { score: null, band: "insufficient", components, baselineDays: maxBaselineDays };
  }

  const weightedZ = weightedSum / weightTotal;
  const score = clamp(Math.round(50 + 50 * Math.tanh(weightedZ / TANH_SCALE)), 1, 99);

  for (const c of components) {
    if (c.z == null) continue;
    c.contribution = round1((WEIGHTS[c.metric] / weightTotal) * c.z * (50 / TANH_SCALE));
  }

  return { score, band: bandFor(score), components, baselineDays: maxBaselineDays };
}

// ---- Public entry point ---------------------------------------------------

export function computeReadiness(
  daysIn: ReadinessDayInput[],
  historyDays: number = HISTORY_DAYS,
): ReadinessScore {
  const days = [...daysIn].sort((a, b) => a.date.localeCompare(b.date));

  const eligible = (d: ReadinessDayInput) =>
    hasAny(d.hrv) || hasAny(d.rhr);
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

  const history: { date: string; score: number }[] = [];
  for (let i = Math.max(0, targetIdx - historyDays + 1); i <= targetIdx; i++) {
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

function hasAny(sv: SourceValues): boolean {
  return sv != null && Object.values(sv).some((v) => v != null);
}

function summarize(s: DayScore): string {
  if (s.score == null) {
    return "Not enough baseline history yet — keep syncing to unlock readiness.";
  }
  const scored = s.components.filter((c) => c.z != null);
  const best = [...scored].sort((a, b) => (b.z ?? 0) - (a.z ?? 0))[0];
  const worst = [...scored].sort((a, b) => (a.z ?? 0) - (b.z ?? 0))[0];
  const lead =
    s.band === "primed" ? "Primed" : s.band === "compromised" ? "Compromised" : "Balanced";
  const parts: string[] = [];
  // Frame by RECOVERY contribution, not raw direction — "above/below
  // baseline" is wrong for inverted metrics (low breathing / RHR is good).
  if (best && (best.z ?? 0) >= 0.5) parts.push(`${best.label.toLowerCase()} is a bright spot`);
  if (worst && (worst.z ?? 0) <= -0.5) parts.push(`${worst.label.toLowerCase()} is dragging`);
  if (parts.length === 0) return `${lead} — everything close to your baseline.`;
  return `${lead} — ${parts.join(", ")}.`;
}
