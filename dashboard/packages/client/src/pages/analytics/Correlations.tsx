import { useCorrelations } from "../../api/queries";
import { Correlations } from "../../components/Correlations";

export function AnalyticsCorrelations() {
  const correlations = useCorrelations();
  if (!correlations.data) return null;
  return <Correlations data={correlations.data} expandedByDefault />;
}
