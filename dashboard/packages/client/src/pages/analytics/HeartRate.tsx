import { useHeartRate } from "../../api/queries";
import { HeartRateChart } from "../../components/charts/HeartRateChart";
import { HrZoneChart } from "../../components/charts/HrZoneChart";
import { DataTable, tdClass, tdRightClass, trClass } from "../../components/DataTable";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";

export function AnalyticsHeartRate() {
  const heartRate = useHeartRate();
  return (
    <QueryBoundary
      query={heartRate}
      empty={<EmptyState icon="favorite" message="No heart rate data in this window" />}
      isEmpty={(d) => d.length === 0}
    >
      {(data) => (
        <div className="space-y-4">
          <HeartRateChart data={data} />
          <HrZoneChart data={data} />
          <DataTable
            title="Daily Heart Rate"
            headers={["Date", "Resting HR", "Fat Burn", "Cardio", "Peak"]}
          >
            {[...data]
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
      )}
    </QueryBoundary>
  );
}
