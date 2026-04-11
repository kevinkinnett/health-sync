import { useState } from "react";
import {
  useActivity,
  useSleep,
  useHeartRate,
  useWeight,
  useHrv,
  useExerciseLogs,
  useDayOfWeekHeatmap,
} from "../api/queries";
import { DayOfWeekHeatmap } from "../components/DayOfWeekHeatmap";
import { ActivityChart } from "../components/charts/ActivityChart";
import { SleepStagesChart } from "../components/charts/SleepStagesChart";
import { HeartRateChart } from "../components/charts/HeartRateChart";
import { WeightChart } from "../components/charts/WeightChart";
import { HrvChart } from "../components/charts/HrvChart";
import { ExerciseLogTable } from "../components/charts/ExerciseLogTable";
import { SleepTimingChart } from "../components/charts/SleepTimingChart";
import { HrZoneChart } from "../components/charts/HrZoneChart";

const tabs = [
  "Activity",
  "Sleep",
  "Heart Rate",
  "HRV",
  "Weight",
  "Exercises",
] as const;
type Tab = (typeof tabs)[number];

const thClass = "text-left py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider";
const thRightClass = "text-right py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider";
const tdClass = "py-3 px-6 text-on-surface tabular-nums";
const tdRightClass = "text-right py-3 px-6 text-on-surface-variant tabular-nums";
const trClass = "border-b border-outline-variant/5 hover:bg-surface-container-high transition-colors";
const trHeadClass = "bg-surface-container-low border-b border-outline-variant/10";

function DataTable({
  title,
  headers,
  children,
}: {
  title: string;
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-container rounded-xl overflow-hidden">
      <div className="p-6 flex items-center justify-between">
        <h3 className="font-headline font-semibold text-lg text-on-surface">{title}</h3>
        <button className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
          <span className="material-symbols-outlined text-sm">download</span>
          <span>Export CSV</span>
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={trHeadClass}>
              <th className={thClass}>{headers[0]}</th>
              {headers.slice(1).map((h) => (
                <th key={h} className={thRightClass}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Explore() {
  const [activeTab, setActiveTab] = useState<Tab>("Activity");
  const heatmap = useDayOfWeekHeatmap();
  const activity = useActivity();
  const sleep = useSleep();
  const heartRate = useHeartRate();
  const weight = useWeight();
  const hrv = useHrv();
  const exerciseLogs = useExerciseLogs();

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface">
            Explore Analytics
          </h1>
          <p className="text-on-surface-variant mt-1">
            Deep-dive into performance correlations and weekly patterns.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 p-1.5 bg-surface-container-low rounded-2xl border border-outline-variant/10">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === tab
                  ? "bg-primary text-on-primary-fixed"
                  : "text-outline hover:text-on-surface"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {/* Heatmap (always visible) */}
      {heatmap.data && <DayOfWeekHeatmap data={heatmap.data} />}

      {activeTab === "Activity" && activity.data && (
        <div className="space-y-4">
          <ActivityChart data={activity.data} />
          <DataTable title="Daily Activity" headers={["Date", "Steps", "Calories", "Active Min", "Distance"]}>
            {[...activity.data].reverse().slice(0, 30).map((d) => (
              <tr key={d.date} className={trClass}>
                <td className={tdClass}>{d.date}</td>
                <td className={tdRightClass}>{d.steps?.toLocaleString() ?? "---"}</td>
                <td className={tdRightClass}>{d.caloriesOut?.toLocaleString() ?? "---"}</td>
                <td className={tdRightClass}>
                  {(d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0)}
                </td>
                <td className={tdRightClass}>{d.distanceKm?.toFixed(1) ?? "---"} km</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {activeTab === "Sleep" && sleep.data && (
        <div className="space-y-4">
          <SleepStagesChart data={sleep.data} />
          <SleepTimingChart data={sleep.data} />
          <DataTable title="Sleep Log" headers={["Date", "Asleep", "In Bed", "Efficiency", "Deep", "REM"]}>
            {[...sleep.data].reverse().slice(0, 30).map((d) => (
              <tr key={d.date} className={trClass}>
                <td className={tdClass}>{d.date}</td>
                <td className={tdRightClass}>
                  {d.totalMinutesAsleep != null ? `${Math.floor(d.totalMinutesAsleep / 60)}h ${d.totalMinutesAsleep % 60}m` : "---"}
                </td>
                <td className={tdRightClass}>
                  {d.totalMinutesInBed != null ? `${Math.floor(d.totalMinutesInBed / 60)}h ${d.totalMinutesInBed % 60}m` : "---"}
                </td>
                <td className={tdRightClass}>{d.efficiency ?? "---"}%</td>
                <td className={tdRightClass}>{d.minutesDeep ?? "---"}m</td>
                <td className={tdRightClass}>{d.minutesRem ?? "---"}m</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {activeTab === "Heart Rate" && heartRate.data && (
        <div className="space-y-4">
          <HeartRateChart data={heartRate.data} />
          <HrZoneChart data={heartRate.data} />
          <DataTable title="Daily Heart Rate" headers={["Date", "Resting HR", "Fat Burn", "Cardio", "Peak"]}>
            {[...heartRate.data].reverse().slice(0, 30).map((d) => (
              <tr key={d.date} className={trClass}>
                <td className={tdClass}>{d.date}</td>
                <td className={tdRightClass}>{d.restingHeartRate ?? "---"} bpm</td>
                <td className={tdRightClass}>{d.zoneFatBurnMin ?? 0} min</td>
                <td className={tdRightClass}>{d.zoneCardioMin ?? 0} min</td>
                <td className={tdRightClass}>{d.zonePeakMin ?? 0} min</td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}

      {activeTab === "HRV" && hrv.data && (
        <div className="space-y-4">
          <HrvChart data={hrv.data} />
          <DataTable title="Daily HRV" headers={["Date", "Daily RMSSD", "Deep Sleep RMSSD"]}>
            {[...hrv.data]
              .reverse()
              .slice(0, 30)
              .map((d) => (
                <tr key={d.date} className={trClass}>
                  <td className={tdClass}>{d.date}</td>
                  <td className={tdRightClass}>
                    {d.dailyRmssd != null ? `${d.dailyRmssd.toFixed(1)} ms` : "---"}
                  </td>
                  <td className={tdRightClass}>
                    {d.deepRmssd != null ? `${d.deepRmssd.toFixed(1)} ms` : "---"}
                  </td>
                </tr>
              ))}
          </DataTable>
        </div>
      )}

      {activeTab === "Weight" && <WeightChart data={weight.data ?? []} />}

      {activeTab === "Exercises" && exerciseLogs.data && (
        <ExerciseLogTable data={exerciseLogs.data} />
      )}
    </div>
  );
}
