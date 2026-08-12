import { useHrv } from "../../api/queries";
import { HrvChart } from "../../components/charts/HrvChart";
import { DataTable, tdClass, tdRightClass, trClass } from "../../components/DataTable";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";
import { useChartAnnotations } from "../../components/charts/annotations";

export function AnalyticsHrv() {
  const hrv = useHrv();
  // Dated changes drawn onto the series, so a shift can be read against
  // what was happening at the time.
  const marks = useChartAnnotations((hrv.data ?? []).map((d) => d.date));
  return (
    <QueryBoundary
      query={hrv}
      empty={<EmptyState icon="monitor_heart" message="No HRV data in this window" />}
      isEmpty={(d) => d.length === 0}
    >
      {(data) => (
        <div className="space-y-4">
          <HrvChart data={data} annotations={marks} />
          <DataTable
            title="Daily HRV"
            headers={["Date", "Daily RMSSD", "Deep Sleep RMSSD", "Method"]}
          >
            {[...data]
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
                  <td className={tdClass}>
                    <span className="text-[11px] text-on-surface-variant">
                      {d.measurementMethod}
                    </span>
                  </td>
                </tr>
              ))}
          </DataTable>
        </div>
      )}
    </QueryBoundary>
  );
}
