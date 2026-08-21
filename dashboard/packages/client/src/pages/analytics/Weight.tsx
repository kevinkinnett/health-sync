import type { NutritionWeightReport } from "@health-dashboard/shared";
import { useNutritionWeight } from "../../api/queries";
import { useChartAnnotations } from "../../components/charts/annotations";
import { CollectionReadiness } from "../../components/nutritionWeight/CollectionReadiness";
import { EnergyContextChart } from "../../components/nutritionWeight/EnergyContextChart";
import { WeightTrend } from "../../components/nutritionWeight/WeightTrend";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";

export function AnalyticsWeight() {
  const query = useNutritionWeight();
  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant max-w-4xl">
        Raw check-ins and a rolling median in your preferred units, with intake and training aligned
        by local date for context. These charts describe timing and trends, not causation.
      </p>
      <QueryBoundary
        query={query}
        empty={
          <EmptyState
            icon="monitor_weight"
            message="No weight observations in this window. Add a check-in and it will appear after the next sync."
          />
        }
        isEmpty={(report) => report.weight.observationCount === 0}
      >
        {(report) => <WeightBody report={report} />}
      </QueryBoundary>
    </div>
  );
}

function WeightBody({ report }: { report: NutritionWeightReport }) {
  const marks = useChartAnnotations(report.days.map((day) => day.date));
  return (
    <div className="space-y-4">
      <WeightTrend report={report} annotations={marks} />
      <EnergyContextChart report={report} annotations={marks} />
      <CollectionReadiness readiness={report.readiness} />
    </div>
  );
}
