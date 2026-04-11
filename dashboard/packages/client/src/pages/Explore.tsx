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

const thClass = "text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium";
const thRightClass = "text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-medium";
const tdClass = "py-1.5 pr-4 text-gray-900 dark:text-gray-100";
const tdRightClass = "text-right py-1.5 px-2 text-gray-700 dark:text-gray-300";
const trClass = "border-b border-gray-50 dark:border-gray-700/50";
const trHeadClass = "border-b border-gray-100 dark:border-gray-700";

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
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">{title}</h3>
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
      {heatmap.data && <DayOfWeekHeatmap data={heatmap.data} />}

      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

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
