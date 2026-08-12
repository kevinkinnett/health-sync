import { useQuery } from "@tanstack/react-query";
import type {
  TrainingSummary,
  HealthSummary,
  WeeklyInsights,
  CorrelationsData,
  DayOfWeekHeatmapData,
  RecordsData,
  ActivityDay,
  SleepDay,
  HeartRateDay,
  WeightEntry,
  HrvDay,
  ExerciseLog,
  Spo2Day,
  BreathingRateDay,
  SkinTempDay,
  CardioScoreDay,
  EightSleepDay,
  FoodLogDay,
  DrivingSummary,
  ReadinessScore,
  SensorAgreementData,
  MedicationIntake,
  SupplementIntake,
} from "@health-dashboard/shared";
import { apiFetch } from "../client";
import { useDateRangeStore } from "../../stores/dateRangeStore";
import { addDays } from "../../lib/userTz";

export function useHealthSummary() {
  return useQuery<HealthSummary>({
    queryKey: ["health", "summary"],
    queryFn: () => apiFetch("/health/summary"),
  });
}

export function useWeeklyInsights() {
  return useQuery<WeeklyInsights>({
    queryKey: ["health", "insights", "weekly"],
    queryFn: () => apiFetch("/health/insights/weekly"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecords() {
  return useQuery<RecordsData>({
    queryKey: ["health", "records"],
    queryFn: () => apiFetch("/health/records"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useDayOfWeekHeatmap() {
  return useQuery<DayOfWeekHeatmapData>({
    queryKey: ["health", "heatmap", "day-of-week"],
    queryFn: () => apiFetch("/health/heatmap/day-of-week"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCorrelations() {
  return useQuery<CorrelationsData>({
    queryKey: ["health", "correlations"],
    queryFn: () => apiFetch("/health/correlations"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useActivity() {
  const { start, end } = useDateRangeStore();
  return useQuery<ActivityDay[]>({
    queryKey: ["health", "activity", start, end],
    queryFn: () => apiFetch(`/health/activity?start=${start}&end=${end}`),
  });
}

export function useSleep() {
  const { start, end } = useDateRangeStore();
  return useQuery<SleepDay[]>({
    queryKey: ["health", "sleep", start, end],
    queryFn: () => apiFetch(`/health/sleep?start=${start}&end=${end}`),
  });
}

export function useHeartRate() {
  const { start, end } = useDateRangeStore();
  return useQuery<HeartRateDay[]>({
    queryKey: ["health", "heart-rate", start, end],
    queryFn: () => apiFetch(`/health/heart-rate?start=${start}&end=${end}`),
  });
}

export function useWeight() {
  const { start, end } = useDateRangeStore();
  return useQuery<WeightEntry[]>({
    queryKey: ["health", "weight", start, end],
    queryFn: () => apiFetch(`/health/weight?start=${start}&end=${end}`),
  });
}

export interface HealthCheck {
  status: string;
  dbConnected: boolean;
}

export function useHealthCheck() {
  return useQuery<HealthCheck>({
    queryKey: ["health-check"],
    queryFn: () => apiFetch("/health-check"),
    refetchInterval: 30_000, // check every 30s
    retry: 1,
  });
}

export function useHrv() {
  const { start, end } = useDateRangeStore();
  return useQuery<HrvDay[]>({
    queryKey: ["health", "hrv", start, end],
    queryFn: () => apiFetch(`/health/hrv?start=${start}&end=${end}`),
  });
}

export function useExerciseLogs() {
  const { start, end } = useDateRangeStore();
  return useQuery<ExerciseLog[]>({
    queryKey: ["health", "exercise-logs", start, end],
    queryFn: () => apiFetch(`/health/exercise-logs?start=${start}&end=${end}`),
  });
}

// Overnight vitals — long-ingested but only recently surfaced. See the
// Vitals analytics screen.
export function useSpo2() {
  const { start, end } = useDateRangeStore();
  return useQuery<Spo2Day[]>({
    queryKey: ["health", "spo2", start, end],
    queryFn: () => apiFetch(`/health/spo2?start=${start}&end=${end}`),
  });
}

export function useEightSleep() {
  const { start, end } = useDateRangeStore();
  return useQuery<EightSleepDay[]>({
    queryKey: ["health", "eight-sleep", start, end],
    queryFn: () => apiFetch(`/health/eight-sleep?start=${start}&end=${end}`),
  });
}

export function useSensorAgreement() {
  const { start, end } = useDateRangeStore();
  return useQuery<SensorAgreementData>({
    queryKey: ["health", "sensor-agreement", start, end],
    queryFn: () => apiFetch(`/health/sensor-agreement?start=${start}&end=${end}`),
  });
}

export interface SensorNightContextData {
  activity: ActivityDay[];
  exerciseLogs: ExerciseLog[];
  medicationIntakes: MedicationIntake[];
  supplementIntakes: SupplementIntake[];
}

/** Loads nearby behavior only after a comparison night is opened. */
export function useSensorNightContext(date: string | null) {
  return useQuery<SensorNightContextData>({
    queryKey: ["health", "sensor-night-context", date],
    enabled: date != null,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!date) throw new Error("A wake date is required");
      const previousDate = addDays(date, -1);
      const nextDate = addDays(date, 1);
      const [activity, exerciseLogs, medicationIntakes, supplementIntakes] = await Promise.all([
        apiFetch<ActivityDay[]>(`/health/activity?start=${previousDate}&end=${date}`),
        apiFetch<ExerciseLog[]>(`/health/exercise-logs?start=${previousDate}&end=${date}`),
        // Intake filters are instants. Fetch through the following midnight,
        // then bucket in the configured IANA zone in the detail panel.
        apiFetch<MedicationIntake[]>(`/medications/intakes?start=${previousDate}&end=${nextDate}`),
        apiFetch<SupplementIntake[]>(`/supplements/intakes?start=${previousDate}&end=${nextDate}`),
      ]);
      return { activity, exerciseLogs, medicationIntakes, supplementIntakes };
    },
  });
}

export function useFood() {
  const { start, end } = useDateRangeStore();
  return useQuery<FoodLogDay[]>({
    queryKey: ["health", "food", start, end],
    queryFn: () => apiFetch(`/health/food?start=${start}&end=${end}`),
  });
}

/**
 * Compact "time in car" summary (Tesla driving). No date params — always
 * the latest window. Under the ["health"] prefix so an ingest run
 * invalidates it with the rest.
 */
export function useDriving() {
  return useQuery<DrivingSummary>({
    queryKey: ["health", "driving"],
    queryFn: () => apiFetch(`/health/driving`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useBreathingRate() {
  const { start, end } = useDateRangeStore();
  return useQuery<BreathingRateDay[]>({
    queryKey: ["health", "breathing-rate", start, end],
    queryFn: () => apiFetch(`/health/breathing-rate?start=${start}&end=${end}`),
  });
}

export function useSkinTemp() {
  const { start, end } = useDateRangeStore();
  return useQuery<SkinTempDay[]>({
    queryKey: ["health", "skin-temp", start, end],
    queryFn: () => apiFetch(`/health/skin-temp?start=${start}&end=${end}`),
  });
}

export function useCardioScore() {
  const { start, end } = useDateRangeStore();
  return useQuery<CardioScoreDay[]>({
    queryKey: ["health", "cardio-score", start, end],
    queryFn: () => apiFetch(`/health/cardio-score?start=${start}&end=${end}`),
  });
}

/**
 * Personal readiness score for the latest scored day. `days` sets the
 * trend length (the dashboard card omits it for a short glance; the
 * detail screen passes ~45). Keyed by `days` so the two coexist; still
 * under the ["health"] prefix so an ingest run invalidates both.
 */
export function useReadiness(days?: number) {
  return useQuery<ReadinessScore>({
    queryKey: ["health", "readiness", days ?? null],
    queryFn: () => apiFetch(`/health/readiness${days ? `?days=${days}` : ""}`),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Step-independent effort. Separate from `useExerciseLogs` because that
 * returns raw sessions; this returns them classified and scored.
 */
export function useTrainingLoad() {
  const { start, end } = useDateRangeStore();
  return useQuery<TrainingSummary>({
    queryKey: ["health", "training-load", start, end],
    queryFn: () => apiFetch(`/health/training-load?start=${start}&end=${end}`),
  });
}
