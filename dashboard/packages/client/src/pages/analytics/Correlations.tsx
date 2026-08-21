import { useCorrelations, useRecoveryEffects, useWorkoutEffects } from "../../api/queries";
import { Correlations } from "../../components/Correlations";
import { WhatsMoving } from "../../components/WhatsMoving";
import { QueryBoundary } from "../../components/QueryBoundary";
import { WorkoutEffects } from "../../components/WorkoutEffects";
import { RecoveryEffects } from "../../components/RecoveryEffects";

export function AnalyticsCorrelations() {
  const correlations = useCorrelations();
  const workoutEffects = useWorkoutEffects();
  const recoveryEffects = useRecoveryEffects();
  return (
    <div className="space-y-8">
      <QueryBoundary query={workoutEffects}>
        {(data) => <WorkoutEffects data={data} />}
      </QueryBoundary>
      <QueryBoundary query={recoveryEffects}>
        {(data) => <RecoveryEffects data={data} />}
      </QueryBoundary>
      <QueryBoundary query={correlations}>
        {(data) => (
          <div className="space-y-6">
            <WhatsMoving data={data} />
            <Correlations data={data} expandedByDefault />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
