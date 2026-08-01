import { useActivity } from "../../api/queries";
import { ActivityChart } from "../../components/charts/ActivityChart";
import { DataTable, tdClass, tdRightClass, trClass } from "../../components/DataTable";
import { useUnits } from "../../stores/unitsStore";
import { formatDistance } from "../../lib/units";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";
import { useChartAnnotations } from "../../components/charts/annotations";

export function AnalyticsActivity() {
  const activity = useActivity();
  const units = useUnits();
  // Dated changes drawn onto the series, so a shift in activity can be read
  // against what was happening at the time.
  const marks = useChartAnnotations((activity.data ?? []).map((d) => d.date));
  return (
    <QueryBoundary
      query={activity}
      empty={<EmptyState icon="footprint" message="No activity data in this window" />}
      isEmpty={(d) => d.length === 0}
    >
      {(data) => (
        <div className="space-y-4">
          <ActivityChart data={data} annotations={marks} />
          <DataTable
            title="Daily Activity"
            headers={["Date", "Steps", "Calories", "Active Min", "Distance"]}
          >
            {[...data]
              .reverse()
              .slice(0, 30)
              .map((d) => (
                <tr key={d.date} className={trClass}>
                  <td className={tdClass}>{d.date}</td>
                  <td className={tdRightClass}>
                    {d.steps?.toLocaleString() ?? "---"}
                  </td>
                  <td className={tdRightClass}>
                    {d.caloriesOut?.toLocaleString() ?? "---"}
                  </td>
                  <td className={tdRightClass}>
                    {(d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0)}
                  </td>
                  <td className={tdRightClass}>
                    {formatDistance(d.distanceKm, units, 1)}
                  </td>
                </tr>
              ))}
          </DataTable>
        </div>
      )}
    </QueryBoundary>
  );
}
