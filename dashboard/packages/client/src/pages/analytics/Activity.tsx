import { useActivity } from "../../api/queries";
import { ActivityChart } from "../../components/charts/ActivityChart";
import { DataTable, tdClass, tdRightClass, trClass } from "../../components/DataTable";

export function AnalyticsActivity() {
  const activity = useActivity();
  if (!activity.data) return null;
  return (
    <div className="space-y-4">
      <ActivityChart data={activity.data} />
      <DataTable
        title="Daily Activity"
        headers={["Date", "Steps", "Calories", "Active Min", "Distance"]}
      >
        {[...activity.data]
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
                {d.distanceKm?.toFixed(1) ?? "---"} km
              </td>
            </tr>
          ))}
      </DataTable>
    </div>
  );
}
