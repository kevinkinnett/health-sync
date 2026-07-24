import { useQuery } from "@tanstack/react-query";
import type { ApiLogEntry, ApiLogStats } from "@health-dashboard/shared";
import { apiFetch } from "../client";

// ---------------------------------------------------------------------------
// API Console — usage stats for the v1 surface
// ---------------------------------------------------------------------------

export function useApiLogStats(windowHours = 24) {
  return useQuery<ApiLogStats>({
    queryKey: ["api-logs", "stats", windowHours],
    queryFn: () =>
      apiFetch(`/admin/api-logs/stats?windowHours=${windowHours}`),
    // Refetch every 30s so the panel feels live without hammering.
    refetchInterval: 30_000,
  });
}

export function useRecentApiCalls(caller?: string, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (caller) params.set("caller", caller);
  return useQuery<ApiLogEntry[]>({
    queryKey: ["api-logs", "recent", caller ?? null, limit],
    queryFn: () => apiFetch(`/admin/api-logs/recent?${params.toString()}`),
    refetchInterval: 30_000,
  });
}
