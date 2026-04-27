import { useHeartRate } from "../../api/queries";
import { HeartRateChart } from "../../components/charts/HeartRateChart";
import { HrZoneChart } from "../../components/charts/HrZoneChart";
import { DataTable, tdClass, tdRightClass, trClass } from "../../components/DataTable";

export function AnalyticsHeartRate() {
  const heartRate = useHeartRate();
  if (!heartRate.data) return null;
  return (
    <div className="space-y-4">
      <HeartRateChart data={heartRate.data} />
      <HrZoneChart data={heartRate.data} />
      <DataTable
        title="Daily Heart Rate"
        headers={["Date", "Resting HR", "Fat Burn", "Cardio", "Peak"]}
      >
        {[...heartRate.data]
          .reverse()
          .slice(0, 30)
          .map((d) => (
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
  );
}
