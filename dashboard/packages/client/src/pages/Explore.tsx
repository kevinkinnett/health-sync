import { useState } from "react";
import {
  useActivity,
  useSleep,
  useHeartRate,
  useWeight,
  useHrv,
  useExerciseLogs,
} from "../api/queries";
import { ActivityChart } from "../components/charts/ActivityChart";
import { SleepStagesChart } from "../components/charts/SleepStagesChart";
import { HeartRateChart } from "../components/charts/HeartRateChart";
import { WeightChart } from "../components/charts/WeightChart";
import { HrvChart } from "../components/charts/HrvChart";
import { ExerciseLogTable } from "../components/charts/ExerciseLogTable";

const tabs = [
  "Activity",
  "Sleep",
  "Heart Rate",
  "HRV",
  "Weight",
  "Exercises",
] as const;
type Tab = (typeof tabs)[number];

export function Explore() {
  const [activeTab, setActiveTab] = useState<Tab>("Activity");
  const activity = useActivity();
  const sleep = useSleep();
  const heartRate = useHeartRate();
  const weight = useWeight();
  const hrv = useHrv();
  const exerciseLogs = useExerciseLogs();

  return (
    <div className="space-y-6">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Activity" && activity.data && (
        <div className="space-y-4">
          <ActivityChart data={activity.data} />
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-500 mb-3">Daily Activity</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Date</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Steps</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Calories</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Active Min</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {[...activity.data].reverse().slice(0, 30).map((d) => (
                    <tr key={d.date} className="border-b border-gray-50">
                      <td className="py-1.5 pr-4 text-gray-900">{d.date}</td>
                      <td className="text-right py-1.5 px-2">{d.steps?.toLocaleString() ?? "---"}</td>
                      <td className="text-right py-1.5 px-2">{d.caloriesOut?.toLocaleString() ?? "---"}</td>
                      <td className="text-right py-1.5 px-2">
                        {(d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0)}
                      </td>
                      <td className="text-right py-1.5 px-2">{d.distanceKm?.toFixed(1) ?? "---"} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Sleep" && sleep.data && (
        <div className="space-y-4">
          <SleepStagesChart data={sleep.data} />
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-500 mb-3">Sleep Log</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Date</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Asleep</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">In Bed</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Efficiency</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Deep</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">REM</th>
                  </tr>
                </thead>
                <tbody>
                  {[...sleep.data].reverse().slice(0, 30).map((d) => (
                    <tr key={d.date} className="border-b border-gray-50">
                      <td className="py-1.5 pr-4 text-gray-900">{d.date}</td>
                      <td className="text-right py-1.5 px-2">
                        {d.totalMinutesAsleep != null ? `${Math.floor(d.totalMinutesAsleep / 60)}h ${d.totalMinutesAsleep % 60}m` : "---"}
                      </td>
                      <td className="text-right py-1.5 px-2">
                        {d.totalMinutesInBed != null ? `${Math.floor(d.totalMinutesInBed / 60)}h ${d.totalMinutesInBed % 60}m` : "---"}
                      </td>
                      <td className="text-right py-1.5 px-2">{d.efficiency ?? "---"}%</td>
                      <td className="text-right py-1.5 px-2">{d.minutesDeep ?? "---"}m</td>
                      <td className="text-right py-1.5 px-2">{d.minutesRem ?? "---"}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Heart Rate" && heartRate.data && (
        <div className="space-y-4">
          <HeartRateChart data={heartRate.data} />
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-500 mb-3">Daily Heart Rate</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Date</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Resting HR</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Fat Burn</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Cardio</th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">Peak</th>
                  </tr>
                </thead>
                <tbody>
                  {[...heartRate.data].reverse().slice(0, 30).map((d) => (
                    <tr key={d.date} className="border-b border-gray-50">
                      <td className="py-1.5 pr-4 text-gray-900">{d.date}</td>
                      <td className="text-right py-1.5 px-2">{d.restingHeartRate ?? "---"} bpm</td>
                      <td className="text-right py-1.5 px-2">{d.zoneFatBurnMin ?? 0} min</td>
                      <td className="text-right py-1.5 px-2">{d.zoneCardioMin ?? 0} min</td>
                      <td className="text-right py-1.5 px-2">{d.zonePeakMin ?? 0} min</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "HRV" && hrv.data && (
        <div className="space-y-4">
          <HrvChart data={hrv.data} />
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-500 mb-3">
              Daily HRV
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">
                      Date
                    </th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">
                      Daily RMSSD
                    </th>
                    <th className="text-right py-2 px-2 text-gray-500 font-medium">
                      Deep Sleep RMSSD
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...hrv.data]
                    .reverse()
                    .slice(0, 30)
                    .map((d) => (
                      <tr key={d.date} className="border-b border-gray-50">
                        <td className="py-1.5 pr-4 text-gray-900">
                          {d.date}
                        </td>
                        <td className="text-right py-1.5 px-2">
                          {d.dailyRmssd != null
                            ? `${d.dailyRmssd.toFixed(1)} ms`
                            : "---"}
                        </td>
                        <td className="text-right py-1.5 px-2">
                          {d.deepRmssd != null
                            ? `${d.deepRmssd.toFixed(1)} ms`
                            : "---"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Weight" && <WeightChart data={weight.data ?? []} />}

      {activeTab === "Exercises" && exerciseLogs.data && (
        <ExerciseLogTable data={exerciseLogs.data} />
      )}
    </div>
  );
}
