import { useSleep } from "../../api/queries";
import { SleepStagesChart } from "../../components/charts/SleepStagesChart";
import { SleepTimingChart } from "../../components/charts/SleepTimingChart";
import { DataTable, tdClass, tdRightClass, trClass } from "../../components/DataTable";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";
import { useChartAnnotations } from "../../components/charts/annotations";

export function AnalyticsSleep() {
  const sleep = useSleep();
  // Dated changes drawn onto the series, so a shift can be read against
  // what was happening at the time.
  const marks = useChartAnnotations((sleep.data ?? []).map((d) => d.date));
  return (
    <QueryBoundary
      query={sleep}
      empty={<EmptyState icon="bedtime" message="No sleep data in this window" />}
      isEmpty={(d) => d.length === 0}
    >
      {(data) => (
        <div className="space-y-4">
          <p className="text-sm text-on-surface-variant">
            Dates are the Eastern local day the main overnight session ended. Main sleep and naps are kept separate so a daytime nap cannot replace or inflate the night.
          </p>
          <SleepStagesChart data={data} annotations={marks} />
          <SleepTimingChart data={data} />
          <DataTable
            title="Sleep Log"
            headers={["Night ending", "Asleep", "Naps", "In Bed", "Efficiency", "Deep", "REM"]}
          >
            {[...data]
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
                    {d.napMinutesAsleep != null && d.napMinutesAsleep > 0
                      ? `${Math.floor(d.napMinutesAsleep / 60)}h ${d.napMinutesAsleep % 60}m`
                      : "—"}
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
      )}
    </QueryBoundary>
  );
}
