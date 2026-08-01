import { useWeight } from "../../api/queries";
import { WeightChart } from "../../components/charts/WeightChart";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";
import { useChartAnnotations } from "../../components/charts/annotations";

export function AnalyticsWeight() {
  const weight = useWeight();
  // Dated changes drawn onto the series, so a shift can be read against
  // what was happening at the time.
  const marks = useChartAnnotations((weight.data ?? []).map((d) => d.date));
  return (
    <QueryBoundary
      query={weight}
      empty={<EmptyState icon="monitor_weight" message="No weight entries in this window" />}
      isEmpty={(d) => d.length === 0}
    >
      {(data) => (
        <div className="space-y-4">
          <WeightChart data={data} annotations={marks} />
        </div>
      )}
    </QueryBoundary>
  );
}
