import { useCorrelations } from "../../api/queries";
import { Correlations } from "../../components/Correlations";
import { WhatsMoving } from "../../components/WhatsMoving";
import { QueryBoundary } from "../../components/QueryBoundary";

export function AnalyticsCorrelations() {
  const correlations = useCorrelations();
  return (
    <QueryBoundary query={correlations}>
      {(data) => (
        <div className="space-y-6">
          <WhatsMoving data={data} />
          <Correlations data={data} expandedByDefault />
        </div>
      )}
    </QueryBoundary>
  );
}
