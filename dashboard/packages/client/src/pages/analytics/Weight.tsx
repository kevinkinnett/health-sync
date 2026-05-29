import { useWeight } from "../../api/queries";
import { WeightChart } from "../../components/charts/WeightChart";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";

export function AnalyticsWeight() {
  const weight = useWeight();
  return (
    <QueryBoundary
      query={weight}
      empty={<EmptyState icon="monitor_weight" message="No weight entries in this window" />}
      isEmpty={(d) => d.length === 0}
    >
      {(data) => (
        <div className="space-y-4">
          <WeightChart data={data} />
        </div>
      )}
    </QueryBoundary>
  );
}
