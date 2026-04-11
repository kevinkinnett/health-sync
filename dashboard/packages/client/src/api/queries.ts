import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  HealthSummary,
  WeeklyInsights,
  CorrelationsData,
  ActivityDay,
  SleepDay,
  HeartRateDay,
  WeightEntry,
  HrvDay,
  ExerciseLog,
  IngestState,
  IngestRun,
  IngestOverview,
  TriggerResponse,
} from "@health-dashboard/shared";
import { apiFetch } from "./client";
import { useDateRangeStore } from "../stores/dateRangeStore";

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

export function useIngestOverview(limit = 20) {
  return useQuery<IngestOverview>({
    queryKey: ["ingest", "overview", limit],
    queryFn: () => apiFetch(`/ingest/overview?limit=${limit}`),
    refetchInterval: 10_000, // poll every 10s to show live job status
  });
}

export function useIngestState() {
  return useQuery<IngestState[]>({
    queryKey: ["ingest", "state"],
    queryFn: () => apiFetch("/ingest/state"),
  });
}

export function useIngestRuns(limit = 20) {
  return useQuery<IngestRun[]>({
    queryKey: ["ingest", "runs", limit],
    queryFn: () => apiFetch(`/ingest/runs?limit=${limit}`),
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

export function useTriggerIngest() {
  const queryClient = useQueryClient();
  return useMutation<TriggerResponse>({
    mutationFn: () =>
      apiFetch("/ingest/trigger", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingest"] });
    },
  });
}
