import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AlertsResponse } from "@health-dashboard/shared";
import { apiFetch } from "../client";

// ---------------------------------------------------------------------------
// Proactive health alerts (the notification bell)
// ---------------------------------------------------------------------------

export function useAlerts(limit = 8) {
  return useQuery<AlertsResponse>({
    queryKey: ["alerts", limit],
    queryFn: () => apiFetch(`/alerts?limit=${limit}`),
    // Poll every few minutes so a freshly-evaluated alert shows up
    // without a manual refresh.
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useMarkAlertsRead() {
  const queryClient = useQueryClient();
  return useMutation<{ updated: number }, Error, void>({
    mutationFn: () => apiFetch(`/alerts/read-all`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient();
  return useMutation<{ updated: number }, Error, number>({
    mutationFn: (id) => apiFetch(`/alerts/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}
