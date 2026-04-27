import { StatCard } from "../components/StatCard";
import { WeeklyInsights } from "../components/WeeklyInsights";
import { GoalRings } from "../components/GoalRings";
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
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-outline text-sm font-medium">Loading...</div>
      </div>
    );
  }

  const s = summary.data;

  return (
    <div className="space-y-6">
      {/* Top Bento: Weekly Insights + Goal Rings */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          {insights.data && <WeeklyInsights data={insights.data} />}
        </div>
        <div>{s && <GoalRings summary={s} />}</div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Steps"
          value={s?.activity.latest?.steps?.toLocaleString() ?? null}
          sparkline={s?.activity.sparkline ?? []}
          color="#c0c1ff"
          icon="footprint"
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
          color="#4edea3"
          icon="bedtime"
        />
        <StatCard
          title="Resting HR"
          value={s?.heartRate.latest?.restingHeartRate ?? null}
          unit="bpm"
          sparkline={s?.heartRate.sparkline ?? []}
          color="#ffb2b7"
          icon="favorite"
        />
        <StatCard
          title="Body Mass"
          value={s?.weight.latest?.weightKg ?? null}
          unit="kg"
          sparkline={s?.weight.sparkline ?? []}
          color="#c0c1ff"
          icon="scale"
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
