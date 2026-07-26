import { useExerciseLogs, useTrainingLoad } from "../../api/queries";
import { ExerciseLogTable } from "../../components/charts/ExerciseLogTable";
import { TrainingLoadChart } from "../../components/charts/TrainingLoadChart";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";

/**
 * Exercise screen. The load chart leads, because the raw session table
 * answers "what did I do" while the chart answers "was it any work" —
 * and the latter is what the rest of the app was missing entirely.
 */
export function AnalyticsExercises() {
  const exerciseLogs = useExerciseLogs();
  const training = useTrainingLoad();

  return (
    <div className="space-y-4">
      <QueryBoundary
        query={training}
        empty={
          <EmptyState
            icon="fitness_center"
            message="No training load in this window — log or auto-detect a session and it'll appear here."
          />
        }
        isEmpty={(d) => d.days.length === 0}
      >
        {(data) => <TrainingLoadChart data={data} />}
      </QueryBoundary>

      <QueryBoundary
        query={exerciseLogs}
        empty={<EmptyState icon="fitness_center" message="No exercise logs in this window" />}
        isEmpty={(d) => d.length === 0}
      >
        {(data) => <ExerciseLogTable data={data} />}
      </QueryBoundary>
    </div>
  );
}
