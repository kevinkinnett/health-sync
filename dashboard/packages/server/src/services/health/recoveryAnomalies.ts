import type {
  RecoveryAnomalyDay,
  RecoveryAnomalyDirection,
  RecoveryAnomalyReport,
  RecoveryAnomalySeverity,
  RecoveryFeature,
  RecoveryFeatureSource,
  ReadinessMetric,
} from "@health-dashboard/shared";
import type { ReadinessDayInput } from "../readiness.js";
import {
  resolveReading,
  SOURCE_PROVENANCE,
  SOURCE_WEIGHTS,
  type FusibleMetric,
  type ReadinessSource,
  type SourceValues,
} from "../signalFusion.js";

/**
 * Explainable, robust unusual-day detection over provider-neutral recovery
 * inputs. This intentionally remains a pure statistical detector: every score
 * can be traced to observed signals and their own source/regime baselines.
 */
export const RECOVERY_ANOMALY_METHOD_VERSION = "recovery-anomaly-v1-robust-weekday";
export const RECOVERY_ANOMALY_TIMEZONE = "America/New_York";
export const RECOVERY_BASELINE_DAYS = 42;
export const RECOVERY_MIN_BASELINE_DAYS = 14;
const MAX_INPUT_DAYS = 430;

export type RecoveryInputProvider = (limit: number) => Promise<ReadinessDayInput[]>;

interface FeatureDefinition {
  metric: FusibleMetric;
  field: keyof ReadinessDayInput;
  label: string;
  unit: string;
  /** Converts natural-direction z into recovery-direction z. */
  recoveryDirection: 1 | -1;
  /** Prevents a nearly-flat baseline from creating absurd deviations. */
  scaleFloor: number;
}

const FUSIBLE_FEATURES: FeatureDefinition[] = [
  { metric: "hrv", field: "hrv", label: "HRV", unit: "ms", recoveryDirection: 1, scaleFloor: 2 },
  { metric: "rhr", field: "rhr", label: "Resting HR", unit: "bpm", recoveryDirection: -1, scaleFloor: 1 },
  { metric: "sleep", field: "sleepMin", label: "Sleep", unit: "min", recoveryDirection: 1, scaleFloor: 15 },
  { metric: "breathing", field: "breathing", label: "Breathing rate", unit: "br/min", recoveryDirection: -1, scaleFloor: 0.2 },
  { metric: "spo2", field: "spo2", label: "Blood oxygen", unit: "%", recoveryDirection: 1, scaleFloor: 0.2 },
];

export class RecoveryAnomalyService {
  constructor(private readonly inputProvider: RecoveryInputProvider) {}

  async get(start: string, end: string, currentDate: string): Promise<RecoveryAnomalyReport> {
    const days = [...await this.inputProvider(MAX_INPUT_DAYS)]
      .sort((a, b) => a.date.localeCompare(b.date));
    const unusualDays: RecoveryAnomalyDay[] = [];
    let daysAnalyzed = 0;

    for (let index = 0; index < days.length; index++) {
      const target = days[index];
      if (target.date < start || target.date > end || target.date >= currentDate) continue;
      const baseline = days.slice(Math.max(0, index - RECOVERY_BASELINE_DAYS), index);
      const features = recoveryFeaturesForDay(target, baseline);
      if (features.length < 3) continue;
      daysAnalyzed++;
      const anomaly = classifyDay(target.date, features);
      if (anomaly) unusualDays.push(anomaly);
    }

    unusualDays.sort((a, b) => b.date.localeCompare(a.date));
    return {
      methodVersion: RECOVERY_ANOMALY_METHOD_VERSION,
      timezone: RECOVERY_ANOMALY_TIMEZONE,
      baselineWindowDays: RECOVERY_BASELINE_DAYS,
      minimumBaselineDays: RECOVERY_MIN_BASELINE_DAYS,
      window: { start, end },
      excludedCurrentDate: currentDate,
      daysAnalyzed,
      unusualDays,
      caveats: [
        "Unusual means different from your own recent pattern, not unhealthy or diagnostic.",
        "Each sensor is compared only with its own matching measurement regime.",
        "The current local date is excluded because provider-derived daily values may still revise.",
      ],
    };
  }
}

export function recoveryFeaturesForDay(
  target: ReadinessDayInput,
  baseline: ReadinessDayInput[],
): RecoveryFeature[] {
  const out: RecoveryFeature[] = [];
  for (const definition of FUSIBLE_FEATURES) {
    const feature = fusedFeature(definition, target, baseline);
    if (feature) out.push(feature);
  }
  const skin = singleFeature({
    metric: "skinTemp", label: "Skin temperature", unit: "°", recoveryDirection: -1,
    scaleFloor: 0.1, value: target.skinTemp,
    baselineValues: baseline.map((day) => ({ date: day.date, value: day.skinTemp })),
    provenance: SOURCE_PROVENANCE.fitbit,
    measurement: "Nightly skin-temperature deviation",
    regime: "google_health_sleep_temperature_v1",
    date: target.date,
  });
  if (skin) out.push(skin);
  const restlessness = singleFeature({
    metric: "restlessness", label: "Restlessness", unit: "events", recoveryDirection: -1,
    scaleFloor: 1, value: target.restlessness,
    baselineValues: baseline.map((day) => ({ date: day.date, value: day.restlessness })),
    provenance: SOURCE_PROVENANCE.eightSleep,
    measurement: "Main-session tosses and turns",
    regime: "eight_sleep_main_session_v1",
    date: target.date,
  });
  if (restlessness) out.push(restlessness);
  return out;
}

function fusedFeature(
  definition: FeatureDefinition,
  target: ReadinessDayInput,
  baseline: ReadinessDayInput[],
): RecoveryFeature | null {
  const targetValues = target[definition.field] as SourceValues;
  const sources: Array<RecoveryFeatureSource & { source: ReadinessSource; comparisonGroup: string }> = [];

  for (const source of Object.keys(SOURCE_WEIGHTS[definition.metric]) as ReadinessSource[]) {
    const reading = resolveReading(definition.metric, source, targetValues?.[source]);
    if (!reading) continue;
    const values = baseline.flatMap((day) => {
      const candidate = resolveReading(
        definition.metric,
        source,
        (day[definition.field] as SourceValues)?.[source],
      );
      return candidate && candidate.regime === reading.regime &&
          candidate.comparisonGroup === reading.comparisonGroup
        ? [{ date: day.date, value: candidate.value as number }]
        : [];
    });
    const robust = robustDeviation(target.date, reading.value as number, values, definition.scaleFloor);
    if (!robust) continue;
    sources.push({
      source,
      provenance: SOURCE_PROVENANCE[source],
      value: round2(reading.value as number),
      expected: round2(robust.expected),
      z: round2(robust.z),
      measurement: reading.measurement,
      regime: reading.regime,
      baselineDays: values.length,
      comparisonGroup: reading.comparisonGroup,
    });
  }

  if (sources.length === 0) return null;
  let weightTotal = 0;
  let recoveryZ = 0;
  for (const source of sources) {
    const weight = SOURCE_WEIGHTS[definition.metric][source.source] ?? 0;
    weightTotal += weight;
    recoveryZ += weight * source.z * definition.recoveryDirection;
  }
  recoveryZ = weightTotal > 0 ? recoveryZ / weightTotal : 0;
  const comparable = new Set(sources.map((source) => source.comparisonGroup)).size === 1;

  return {
    metric: definition.metric as ReadinessMetric,
    label: definition.label,
    unit: definition.unit,
    value: comparable ? weighted(sources, "value", definition.metric) : null,
    expected: comparable ? weighted(sources, "expected", definition.metric) : null,
    recoveryZ: round2(recoveryZ),
    impact: impactFor(recoveryZ),
    sources: sources.map(({ source: _source, comparisonGroup: _group, ...value }) => value),
  };
}

function singleFeature(input: {
  metric: ReadinessMetric;
  label: string;
  unit: string;
  recoveryDirection: 1 | -1;
  scaleFloor: number;
  value: number | null;
  baselineValues: Array<{ date: string; value: number | null }>;
  provenance: RecoveryFeatureSource["provenance"];
  measurement: string;
  regime: string;
  date: string;
}): RecoveryFeature | null {
  if (input.value == null) return null;
  const values = input.baselineValues.filter(
    (point): point is { date: string; value: number } => point.value != null,
  );
  const robust = robustDeviation(input.date, input.value, values, input.scaleFloor);
  if (!robust) return null;
  const recoveryZ = robust.z * input.recoveryDirection;
  return {
    metric: input.metric,
    label: input.label,
    unit: input.unit,
    value: round2(input.value),
    expected: round2(robust.expected),
    recoveryZ: round2(recoveryZ),
    impact: impactFor(recoveryZ),
    sources: [{
      provenance: input.provenance,
      value: round2(input.value),
      expected: round2(robust.expected),
      z: round2(robust.z),
      measurement: input.measurement,
      regime: input.regime,
      baselineDays: values.length,
    }],
  };
}

function robustDeviation(
  targetDate: string,
  target: number,
  baseline: Array<{ date: string; value: number }>,
  scaleFloor: number,
): { expected: number; z: number } | null {
  if (baseline.length < RECOVERY_MIN_BASELINE_DAYS) return null;
  const values = baseline.map((point) => point.value);
  const center = median(values);
  const weekdayValues = baseline
    .filter((point) => weekday(point.date) === weekday(targetDate))
    .map((point) => point.value);
  const expected = weekdayValues.length >= 4 ? median(weekdayValues) : center;
  const mad = median(values.map((value) => Math.abs(value - center)));
  const scale = Math.max(scaleFloor, 1.4826 * mad);
  return { expected, z: clamp((target - expected) / scale, -5, 5) };
}

function classifyDay(date: string, features: RecoveryFeature[]): RecoveryAnomalyDay | null {
  const ranked = [...features].sort((a, b) => Math.abs(b.recoveryZ) - Math.abs(a.recoveryZ));
  const meaningful = ranked.filter((feature) => Math.abs(feature.recoveryZ) >= 1.25);
  const top = ranked.slice(0, 3);
  const strength = top.reduce((sum, feature) => sum + Math.abs(feature.recoveryZ), 0) / top.length;
  if (strength < 1.5 || (Math.abs(top[0]?.recoveryZ ?? 0) < 1.75 && meaningful.length < 2)) {
    return null;
  }
  const worse = meaningful.reduce(
    (sum, feature) => sum + (feature.recoveryZ < 0 ? Math.abs(feature.recoveryZ) : 0), 0,
  );
  const better = meaningful.reduce(
    (sum, feature) => sum + (feature.recoveryZ > 0 ? feature.recoveryZ : 0), 0,
  );
  const direction: RecoveryAnomalyDirection =
    worse > better * 1.25 ? "worse" : better > worse * 1.25 ? "better" : "mixed";
  const severity: RecoveryAnomalySeverity =
    strength >= 3 ? "strong" : strength >= 2.1 ? "notable" : "watch";
  return {
    date,
    score: Math.min(100, Math.round((strength / 4) * 100)),
    severity,
    direction,
    summary: summaryFor(direction, meaningful.slice(0, 3)),
    coveragePct: Math.round((features.length / 7) * 100),
    features: ranked,
  };
}

function summaryFor(direction: RecoveryAnomalyDirection, leaders: RecoveryFeature[]): string {
  const names = leaders.map((feature) => feature.label).join(", ") || "multiple signals";
  if (direction === "worse") return `${names} made this a worse-than-usual recovery day.`;
  if (direction === "better") return `${names} made this a better-than-usual recovery day.`;
  return `${names} moved unusually, with recovery signals pointing in different directions.`;
}

function weighted(
  sources: Array<RecoveryFeatureSource & { source: ReadinessSource }>,
  field: "value" | "expected",
  metric: FusibleMetric,
): number {
  let total = 0;
  let weightTotal = 0;
  for (const source of sources) {
    const weight = SOURCE_WEIGHTS[metric][source.source] ?? 0;
    total += source[field] * weight;
    weightTotal += weight;
  }
  return round2(weightTotal > 0 ? total / weightTotal : 0);
}

function impactFor(recoveryZ: number): RecoveryFeature["impact"] {
  if (recoveryZ <= -1.25) return "worse";
  if (recoveryZ >= 1.25) return "better";
  return "neutral";
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
