import { useExerciseLogs } from "../../api/queries";
import { ExerciseLogTable } from "../../components/charts/ExerciseLogTable";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";

export function AnalyticsExercises() {
  const exerciseLogs = useExerciseLogs();
  return (
    <QueryBoundary
      query={exerciseLogs}
      empty={<EmptyState icon="fitness_center" message="No exercise logs in this window" />}
      isEmpty={(d) => d.length === 0}
    >
      {(data) => <ExerciseLogTable data={data} />}
    </QueryBoundary>
  );
}
