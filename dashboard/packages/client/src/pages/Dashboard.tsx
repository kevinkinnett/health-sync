import { StatCard } from "../components/StatCard";
import { WeeklyInsights } from "../components/WeeklyInsights";
import { GoalRings } from "../components/GoalRings";
import { ReadinessCard } from "../components/ReadinessCard";
import { DrivingCard } from "../components/DrivingCard";
import { DidItWorkCard } from "../components/DidItWorkCard";
import {
  useHealthSummary,
  useWeeklyInsights,
  useReadiness,
  useDriving,
  useExperimentSummaries,
} from "../api/queries";
import { useUnits } from "../stores/unitsStore";
import { convertWeight, weightUnitLabel } from "../lib/units";
import { METRIC_COLOR } from "../components/charts/chartPalette";
import { PageHeader } from "../components/ui/PageHeader";
import { PageError, PageSkeleton, PartialDataNotice } from "../components/ui/PageState";
import type { HealthSummary } from "@health-dashboard/shared";

function isHealthSummary(value: unknown): value is HealthSummary {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Partial<HealthSummary>;
  return Boolean(candidate.activity && candidate.sleep && candidate.heartRate && candidate.weight);
}

export function Dashboard() {
  const summary = useHealthSummary();
  const insights = useWeeklyInsights();
  const readiness = useReadiness();
  const driving = useDriving();
  const experiments = useExperimentSummaries();
  const units = useUnits();

  if (summary.isLoading) {
    return <PageSkeleton />;
  }

  if (summary.isError || !isHealthSummary(summary.data)) {
    return <PageError onRetry={() => void summary.refetch()} />;
  }

  const s = summary.data;
  const supporting = [insights, readiness, driving, experiments];
  const hasPartialError = supporting.some((query) => query.isError);
  const weeklyData =
    insights.data && !Array.isArray(insights.data) && "currentPeriod" in insights.data
      ? insights.data
      : null;
  const drivingData = driving.data && !Array.isArray(driving.data) ? driving.data : null;
  const retrySupporting = () => {
    for (const query of supporting) void query.refetch();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Your daily briefing"
        title="Today"
        description="Recovery, meaningful changes, and the few signals worth your attention right now."
      />

      {hasPartialError && <PartialDataNotice onRetry={retrySupporting} />}

      {readiness.data && <ReadinessCard data={readiness.data} to="/readiness" />}

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
          {weeklyData && <WeeklyInsights data={weeklyData} />}

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
          <GoalRings summary={s} />
          {drivingData && <DrivingCard data={drivingData} />}
        </div>
      </div>
    </div>
  );
}
