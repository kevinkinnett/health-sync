import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  IngestState,
  IngestRun,
  IngestOverview,
  IngestStatus,
  TriggerResponse,
} from "@health-dashboard/shared";
import { apiFetch } from "../client";
import { invalidateAfterIngest } from "./_invalidation.js";

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

export function useIngestStatus() {
  return useQuery<IngestStatus>({
    queryKey: ["ingest", "status"],
    queryFn: () => apiFetch("/ingest/status"),
    refetchInterval: 60_000,
  });
}

export function useIngestRuns(limit = 20) {
  return useQuery<IngestRun[]>({
    queryKey: ["ingest", "runs", limit],
    queryFn: () => apiFetch(`/ingest/runs?limit=${limit}`),
  });
}

export function useTriggerIngest() {
  const queryClient = useQueryClient();
  return useMutation<TriggerResponse>({
    mutationFn: () =>
      apiFetch("/ingest/trigger", { method: "POST" }),
    onSuccess: () => {
      invalidateAfterIngest(queryClient);
    },
  });
}
