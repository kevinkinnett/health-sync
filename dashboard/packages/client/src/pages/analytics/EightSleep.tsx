import type { EightSleepDay } from "@health-dashboard/shared";
import { useEightSleep } from "../../api/queries";
import {
  MetricLineChart,
  type MetricPoint,
} from "../../components/charts/MetricLineChart";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";
import { METRIC_COLOR, SERIES } from "../../components/charts/chartPalette";
import { useChartAnnotations } from "../../components/charts/annotations";

/**
 * Eight Sleep nightly screen (roadmap Phase 2). The mattress is a
 * contact-sensor source for the overnight recovery signals — surfaced
 * here as browsable history. These same metrics are fused with Fitbit
 * into the readiness score; this view shows the Eight Sleep side raw.
 */
export function AnalyticsEightSleep() {
  const q = useEightSleep();
  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Your Eight Sleep Pod measures overnight heart rate, HRV, breathing,
        sleep stages, and bed/room temperature without anything on your wrist.
        These feed your readiness score alongside Fitbit — here they are raw.
      </p>
      <QueryBoundary
        query={q}
        empty={<EmptyState icon="bed" message="No Eight Sleep nights in this window" />}
        isEmpty={(d) => d.length === 0}
      >
        {(data) => <EightSleepBody data={data} />}
      </QueryBoundary>
    </div>
  );
}

function EightSleepBody({ data }: { data: EightSleepDay[] }) {
  const latest = data[data.length - 1];
  // The Eight Sleep's own arrival is an intervention, so these series
  // are exactly the ones worth annotating.
  const marks = useChartAnnotations(data.map((d) => d.date));
  const hours = (min: number | null) =>
    min != null ? Math.round(min / 6) / 10 : null;

  return (
    <div className="space-y-4">
      {latest && <LastNightCard night={latest} />}

      <MetricLineChart
        annotations={marks}
        title="Sleep Score"
        description="Eight Sleep's nightly sleep score (0–100)."
        unit=""
        color={METRIC_COLOR.sleepMin}
        domain={[0, 100]}
        digits={0}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.score }))}
      />
      <MetricLineChart
        annotations={marks}
        title="Time Asleep"
        description="Total time asleep per night."
        unit="h"
        color={SERIES[0]}
        movingAverage
        data={data.map((d): MetricPoint => ({ date: d.date, value: hours(d.sleepDurationMin) }))}
      />
      <MetricLineChart
        annotations={marks}
        title="Overnight Heart Rate"
        description="Average heart rate during sleep. This is the more dynamic signal that drives ~65% of the fused resting-HR readiness input — Fitbit's wrist RHR is far more smoothed."
        unit="bpm"
        color={METRIC_COLOR.restingHr}
        movingAverage
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.avgHeartRate }))}
      />
      <MetricLineChart
        annotations={marks}
        title="HRV (RMSSD)"
        description="Heart-rate variability during sleep. Higher = better recovered; agrees closely with Fitbit (r≈0.91)."
        unit="ms"
        color={METRIC_COLOR.deepMin}
        movingAverage
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.avgHrvRmssd }))}
      />
      <MetricLineChart
        annotations={marks}
        title="Respiratory Rate"
        description="Breaths per minute during sleep."
        unit="/min"
        color={METRIC_COLOR.dailyRmssd}
        movingAverage
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.avgRespiratoryRate }))}
      />
      <MetricLineChart
        annotations={marks}
        title="Bed Temperature"
        description="Average Pod surface temperature. Environmental (Pod-heating dependent), so it's deliberately NOT part of the readiness score."
        unit="°C"
        color={SERIES[5]}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.avgBedTempC }))}
      />
      <MetricLineChart
        annotations={marks}
        title="Restlessness (toss & turns)"
        description="Movement events through the night — a small penalty signal in readiness."
        unit=""
        color={METRIC_COLOR.tnt}
        movingAverage
        digits={0}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.tnt }))}
      />
    </div>
  );
}

function LastNightCard({ night }: { night: EightSleepDay }) {
  const hm = (min: number | null) =>
    min != null ? `${Math.floor(min / 60)}h ${min % 60}m` : "—";
  const stats: { label: string; value: string | number }[] = [
    { label: "Score", value: night.score ?? "—" },
    { label: "Asleep", value: hm(night.sleepDurationMin) },
    { label: "Deep", value: hm(night.deepMin) },
    { label: "REM", value: hm(night.remMin) },
    {
      label: "Avg HR",
      value: night.avgHeartRate != null ? `${Math.round(night.avgHeartRate)} bpm` : "—",
    },
    {
      label: "HRV",
      value: night.avgHrvRmssd != null ? `${Math.round(night.avgHrvRmssd)} ms` : "—",
    },
  ];
  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface flex items-baseline justify-between">
        <span className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-primary text-base"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            bed
          </span>
          Last night
        </span>
        <span className="text-[11px] text-outline tabular-nums">{night.date}</span>
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-xl font-bold font-headline tabular-nums text-on-surface">
              {s.value}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-outline">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
