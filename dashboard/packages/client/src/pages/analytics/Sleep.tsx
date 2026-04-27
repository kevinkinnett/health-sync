import { useSleep } from "../../api/queries";
import { SleepStagesChart } from "../../components/charts/SleepStagesChart";
import { SleepTimingChart } from "../../components/charts/SleepTimingChart";
import { DataTable, tdClass, tdRightClass, trClass } from "../../components/DataTable";

export function AnalyticsSleep() {
  const sleep = useSleep();
  if (!sleep.data) return null;
  return (
    <div className="space-y-4">
      <SleepStagesChart data={sleep.data} />
      <SleepTimingChart data={sleep.data} />
      <DataTable
        title="Sleep Log"
        headers={["Date", "Asleep", "In Bed", "Efficiency", "Deep", "REM"]}
      >
        {[...sleep.data]
          .reverse()
          .slice(0, 30)
          .map((d) => (
            <tr key={d.date} className={trClass}>
              <td className={tdClass}>{d.date}</td>
              <td className={tdRightClass}>
                {d.totalMinutesAsleep != null
                  ? `${Math.floor(d.totalMinutesAsleep / 60)}h ${d.totalMinutesAsleep % 60}m`
                  : "---"}
              </td>
              <td className={tdRightClass}>
                {d.totalMinutesInBed != null
                  ? `${Math.floor(d.totalMinutesInBed / 60)}h ${d.totalMinutesInBed % 60}m`
                  : "---"}
              </td>
              <td className={tdRightClass}>{d.efficiency ?? "---"}%</td>
              <td className={tdRightClass}>{d.minutesDeep ?? "---"}m</td>
              <td className={tdRightClass}>{d.minutesRem ?? "---"}m</td>
            </tr>
          ))}
      </DataTable>
    </div>
  );
}
