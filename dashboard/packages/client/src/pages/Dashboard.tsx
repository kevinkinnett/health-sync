import { StatCard } from "../components/StatCard";
import { WeeklyInsights } from "../components/WeeklyInsights";
import { ActivityChart } from "../components/charts/ActivityChart";
import { SleepStagesChart } from "../components/charts/SleepStagesChart";
import { HeartRateChart } from "../components/charts/HeartRateChart";
import { WeightChart } from "../components/charts/WeightChart";
import {
  useHealthSummary,
  useWeeklyInsights,
  useActivity,
  useSleep,
  useHeartRate,
  useWeight,
} from "../api/queries";

export function Dashboard() {
  const summary = useHealthSummary();
  const insights = useWeeklyInsights();
  const activity = useActivity();
  const sleep = useSleep();
  const heartRate = useHeartRate();
  const weight = useWeight();

  if (summary.isLoading) {
    return <div className="text-gray-400 text-center py-12">Loading...</div>;
  }

  const s = summary.data;

  return (
    <div className="space-y-6">
      {/* Weekly Insights */}
      {insights.data && <WeeklyInsights data={insights.data} />}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Steps"
          value={s?.activity.latest?.steps ?? null}
          sparkline={s?.activity.sparkline ?? []}
          color="#6366f1"
        />
        <StatCard
          title="Sleep"
          value={
            s?.sleep.latest?.totalMinutesAsleep != null
              ? (s.sleep.latest.totalMinutesAsleep / 60).toFixed(1)
              : null
          }
          unit="hrs"
          sparkline={s?.sleep.sparkline ?? []}
          color="#3b82f6"
        />
        <StatCard
          title="Resting HR"
          value={s?.heartRate.latest?.restingHeartRate ?? null}
          unit="bpm"
          sparkline={s?.heartRate.sparkline ?? []}
          color="#ef4444"
        />
        <StatCard
          title="Weight"
          value={s?.weight.latest?.weightKg ?? null}
          unit="kg"
          sparkline={s?.weight.sparkline ?? []}
          color="#10b981"
        />
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
