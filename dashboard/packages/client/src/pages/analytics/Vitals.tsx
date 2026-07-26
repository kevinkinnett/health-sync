import {
  useBreathingRate,
  useCardioScore,
  useSkinTemp,
  useSpo2,
} from "../../api/queries";
import type { CardioScoreDay } from "@health-dashboard/shared";
import {
  MetricLineChart,
  type MetricPoint,
} from "../../components/charts/MetricLineChart";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";
import { METRIC_COLOR } from "../../components/charts/chartPalette";

/**
 * Overnight "vitals" / recovery screen. These four metrics were
 * ingested from Fitbit for ~13 months but had no UI until now —
 * surfacing them is roadmap item #1 ("collected but not understood").
 *
 * SpO2, breathing rate, and skin-temp deviation are the classic
 * overnight illness / under-recovery signals; VO2 max is a slow-moving
 * fitness range (a string like "43-47", so it gets a current-value +
 * change-history card rather than a daily line).
 *
 * Each metric is wrapped in its own QueryBoundary so one slow/failed
 * query doesn't blank the others.
 */
export function AnalyticsVitals() {
  const spo2 = useSpo2();
  const breathing = useBreathingRate();
  const skinTemp = useSkinTemp();
  const cardio = useCardioScore();

  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Overnight recovery signals. A sustained rise in breathing rate or
        skin temperature, or a dip in blood oxygen, often precedes feeling
        run-down — worth watching together.
      </p>

      <QueryBoundary
        query={spo2}
        empty={<EmptyState icon="spo2" message="No SpO2 data in this window" />}
        isEmpty={(d) => d.length === 0}
      >
        {(data) => (
          <MetricLineChart
            title="Blood Oxygen (SpO2)"
            description="Nightly average blood-oxygen saturation. Healthy overnight averages sit around 95–100%; repeated dips can signal disturbed breathing."
            unit="%"
            color={METRIC_COLOR.spo2}
            movingAverage
            domain={["dataMin - 1", 100]}
            data={data.map((d): MetricPoint => ({ date: d.date, value: d.avgValue }))}
          />
        )}
      </QueryBoundary>

      <QueryBoundary
        query={breathing}
        empty={<EmptyState icon="pulmonology" message="No breathing-rate data in this window" />}
        isEmpty={(d) => d.length === 0}
      >
        {(data) => (
          <MetricLineChart
            title="Breathing Rate"
            description="Average breaths per minute during sleep. A sustained rise above your baseline is an early under-recovery / illness signal."
            unit="br/min"
            color={METRIC_COLOR.breathingRate}
            movingAverage
            data={data.map((d): MetricPoint => ({ date: d.date, value: d.breathingRate }))}
          />
        )}
      </QueryBoundary>

      <QueryBoundary
        query={skinTemp}
        empty={<EmptyState icon="device_thermostat" message="No skin-temperature data in this window" />}
        isEmpty={(d) => d.length === 0}
      >
        {(data) => (
          <MetricLineChart
            title="Skin Temperature Deviation"
            description="Nightly skin temperature vs your personal baseline (0 = baseline). Multi-night positive deviation is part of the standard illness / over-training triad."
            unit="°"
            color={METRIC_COLOR.skinTemp}
            referenceZero
            domain={["dataMin - 0.3", "dataMax + 0.3"]}
            data={data.map((d): MetricPoint => ({ date: d.date, value: d.nightlyRelative }))}
          />
        )}
      </QueryBoundary>

      <QueryBoundary
        query={cardio}
        empty={<EmptyState icon="cardiology" message="No cardio-fitness data in this window" />}
        isEmpty={(d) => d.length === 0}
      >
        {(data) => <CardioScoreCard data={data} />}
      </QueryBoundary>
    </div>
  );
}

/**
 * VO2 max / cardio fitness is reported as a slow-moving range string
 * (e.g. "43-47"), so a daily line chart would be a flat line. Instead
 * show the current value prominently plus the points in the window
 * where it changed.
 */
function CardioScoreCard({ data }: { data: CardioScoreDay[] }) {
  const withValues = data.filter((d) => d.vo2Max != null);
  const latest = withValues[withValues.length - 1] ?? null;

  // Collapse consecutive identical values into "changed on" entries.
  const changes: { date: string; value: string }[] = [];
  let prev: string | null = null;
  for (const d of withValues) {
    if (d.vo2Max !== prev) {
      changes.push({ date: d.date, value: d.vo2Max as string });
      prev = d.vo2Max;
    }
  }
  changes.reverse(); // most-recent first

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-1">
        Cardio Fitness (VO2 max)
      </h3>
      <p className="text-xs text-outline mb-4">
        Fitbit's estimated VO2 max, reported as a range. It moves slowly,
        so expect long flat stretches — the history below lists only the
        points where it shifted within this window.
      </p>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-bold font-headline tabular-nums text-on-surface">
          {latest?.vo2Max ?? "—"}
        </span>
        <span className="text-sm text-outline">mL/kg/min</span>
      </div>
      {changes.length > 1 ? (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest font-bold text-outline mb-1">
            Changes in window
          </div>
          {changes.map((c) => (
            <div
              key={c.date}
              className="flex items-center justify-between text-sm border-b border-outline-variant/5 py-1"
            >
              <span className="text-on-surface tabular-nums">{c.value}</span>
              <span className="text-outline text-xs tabular-nums">{c.date}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-outline">
          Unchanged across this window.
        </p>
      )}
    </div>
  );
}
