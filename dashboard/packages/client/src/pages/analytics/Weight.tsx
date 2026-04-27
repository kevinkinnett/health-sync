import { useWeight } from "../../api/queries";
import { WeightChart } from "../../components/charts/WeightChart";

export function AnalyticsWeight() {
  const weight = useWeight();
  return (
    <div className="space-y-4">
      <WeightChart data={weight.data ?? []} />
    </div>
  );
}
