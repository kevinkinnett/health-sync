import { StatCard } from "../components/StatCard";
import { WeeklyInsights } from "../components/WeeklyInsights";
import { GoalRings } from "../components/GoalRings";
import { ReadinessCard } from "../components/ReadinessCard";
import { DrivingCard } from "../components/DrivingCard";
import { DidItWorkCard } from "../components/DidItWorkCard";
import { QueryBoundary } from "../components/QueryBoundary";
import { ActivityChart } from "../components/charts/ActivityChart";
import { SleepStagesChart } from "../components/charts/SleepStagesChart";
import { HeartRateChart } from "../components/charts/HeartRateChart";
import { WeightChart } from "../components/charts/WeightChart";
import {
  useHealthSummary,
  useWeeklyInsights,
  useReadiness,
  useActivity,
  useSleep,
  useHeartRate,
  useWeight,
  useDriving,
  useExperimentSummaries,
} from "../api/queries";
import { useUnits } from "../stores/unitsStore";
import { convertWeight, weightUnitLabel } from "../lib/units";
import { METRIC_COLOR } from "../components/charts/chartPalette";

export function Dashboard() {
  const summary = useHealthSummary();
  const insights = useWeeklyInsights();
  const readiness = useReadiness();
  const activity = useActivity();
  const sleep = useSleep();
  const heartRate = useHeartRate();
  const weight = useWeight();
  const driving = useDriving();
  const experiments = useExperimentSummaries();
  const units = useUnits();

  if (summary.isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-outline text-sm font-medium">Loading...</div>
      </div>
    );
  }

  const s = summary.data;

  return (
    <div className="space-y-6">
      {/* Readiness — the "today" instrument, above everything else. */}
      <QueryBoundary query={readiness} skeleton={null}>
        {(data) => <ReadinessCard data={data} to="/readiness" />}
      </QueryBoundary>

      {/*
        Two columns, and the stat tiles live INSIDE the left one.
        `items-start` so neither column stretches to the row height.

        They used to be a full-width row below this grid, which left the
        left column ~300px shorter than the right rail and so a large empty
        rectangle beside it. Filling the column with content the reader
        wants anyway beats trying to balance the rail by removing things
        from it.
      */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 space-y-6">
          {insights.data && <WeeklyInsights data={insights.data} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              title="Total Steps"
              value={s?.activity.latest?.steps?.toLocaleString() ?? null}
              sparkline={s?.activity.sparkline ?? []}
              color={METRIC_COLOR.steps}
              icon="footprint"
              betterDirection="up"
            />
            <StatCard
              title="Rest Duration"
              value={
                s?.sleep.latest?.totalMinutesAsleep != null
                  ? `${Math.floor(s.sleep.latest.totalMinutesAsleep / 60)}:${String(s.sleep.latest.totalMinutesAsleep % 60).padStart(2, "0")}`
                  : null
              }
              unit="hrs"
              sparkline={s?.sleep.sparkline ?? []}
              color={METRIC_COLOR.sleepMin}
              icon="bedtime"
              betterDirection="up"
            />
            <StatCard
              title="Resting HR"
              value={s?.heartRate.latest?.restingHeartRate ?? null}
              unit="bpm"
              sparkline={s?.heartRate.sparkline ?? []}
              color={METRIC_COLOR.restingHr}
              icon="favorite"
              betterDirection="down"
            />
            <StatCard
              title="Body Mass"
              value={
                s?.weight.latest?.weightKg != null
                  ? Number(convertWeight(s.weight.latest.weightKg, units)?.toFixed(1))
                  : null
              }
              unit={weightUnitLabel(units)}
              sparkline={s?.weight.sparkline ?? []}
              color={METRIC_COLOR.weight}
              icon="scale"
            />
          </div>
        </div>
        <div className="space-y-6">
          {/* The one question the dashboard never asked. Above the rings
              because "did the thing I changed work" outranks "did I hit a
              step goal" — and because unasked, it went unanswered for
              weeks while the engine behind it sat finished. */}
          {experiments.data && <DidItWorkCard data={experiments.data} />}
          {s && <GoalRings summary={s} />}
          <QueryBoundary query={driving} skeleton={null}>
            {(data) => <DrivingCard data={data} />}
          </QueryBoundary>
        </div>
      </div>


      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {activity.data && <ActivityChart data={activity.data} />}
        {sleep.data && <SleepStagesChart data={sleep.data} />}
        {heartRate.data && <HeartRateChart data={heartRate.data} />}
        <WeightChart data={weight.data ?? []} />
      </div>
    </div>
  );
}
