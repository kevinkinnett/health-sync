import { useCorrelations } from "../../api/queries";
import { Correlations } from "../../components/Correlations";
import { QueryBoundary } from "../../components/QueryBoundary";

export function AnalyticsCorrelations() {
  const correlations = useCorrelations();
  return (
    <QueryBoundary query={correlations}>
      {(data) => <Correlations data={data} expandedByDefault />}
    </QueryBoundary>
  );
}
