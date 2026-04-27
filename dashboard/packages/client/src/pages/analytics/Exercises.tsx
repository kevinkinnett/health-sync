import { useExerciseLogs } from "../../api/queries";
import { ExerciseLogTable } from "../../components/charts/ExerciseLogTable";

export function AnalyticsExercises() {
  const exerciseLogs = useExerciseLogs();
  if (!exerciseLogs.data) return null;
  return <ExerciseLogTable data={exerciseLogs.data} />;
}
