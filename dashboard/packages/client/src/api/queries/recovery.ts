import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateRecoveryActivityBody,
  CreateRecoverySessionBody,
  RecoveryActivity,
  RecoveryEffectsData,
  RecoveryPendingAction,
  RecoverySession,
  ConfirmRecoveryPendingActionBody,
  UpdateRecoveryActivityBody,
  UpdateRecoverySessionBody,
} from "@health-dashboard/shared";
import { apiFetch } from "../client";
import { invalidateRecovery } from "./_invalidation";

export function useRecoveryActivities(includeInactive = false) {
  return useQuery<RecoveryActivity[]>({
    queryKey: ["recovery", "activities", includeInactive],
    queryFn: () => apiFetch(`/recovery/activities${includeInactive ? "?includeInactive=true" : ""}`),
  });
}

export function useRecoverySessions(start?: string, end?: string, activityId?: number) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (activityId != null) params.set("activityId", String(activityId));
  const query = params.toString();
  return useQuery<RecoverySession[]>({
    queryKey: ["recovery", "sessions", start ?? null, end ?? null, activityId ?? null],
    queryFn: () => apiFetch(`/recovery/sessions${query ? `?${query}` : ""}`),
  });
}

export function useRecoveryEffects() {
  return useQuery<RecoveryEffectsData>({
    queryKey: ["recovery", "effects"],
    queryFn: () => apiFetch("/recovery/effects"),
  });
}

function recoveryMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  return function useRecoveryMutation() {
    const queryClient = useQueryClient();
    return useMutation<TData, Error, TVariables>({
      mutationFn,
      onSuccess: () => invalidateRecovery(queryClient),
    });
  };
}

export const useCreateRecoveryActivity = recoveryMutation<RecoveryActivity, CreateRecoveryActivityBody>(
  (body) => apiFetch("/recovery/activities", { method: "POST", body: JSON.stringify(body) }),
);
export const useUpdateRecoveryActivity = recoveryMutation<
  RecoveryActivity,
  { id: number; body: UpdateRecoveryActivityBody }
>(({ id, body }) => apiFetch(`/recovery/activities/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
export const useArchiveRecoveryActivity = recoveryMutation<void, number>(
  (id) => apiFetch(`/recovery/activities/${id}`, { method: "DELETE" }),
);
export const useCreateRecoverySession = recoveryMutation<RecoverySession, CreateRecoverySessionBody>(
  (body) => apiFetch("/recovery/sessions", { method: "POST", body: JSON.stringify(body) }),
);
export const useUpdateRecoverySession = recoveryMutation<
  RecoverySession,
  { id: number; body: UpdateRecoverySessionBody }
>(({ id, body }) => apiFetch(`/recovery/sessions/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
export const useDeleteRecoverySession = recoveryMutation<void, number>(
  (id) => apiFetch(`/recovery/sessions/${id}`, { method: "DELETE" }),
);

export function useConfirmRecoveryAction() {
  const queryClient = useQueryClient();
  return useMutation<
    { action: RecoveryPendingAction; session: RecoverySession },
    Error,
    { id: string; body: ConfirmRecoveryPendingActionBody }
  >({
    mutationFn: ({ id, body }) => apiFetch(`/recovery/pending-actions/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      invalidateRecovery(queryClient);
      queryClient.invalidateQueries({ queryKey: ["insights", "chat"] });
    },
  });
}

export function useCancelRecoveryAction() {
  const queryClient = useQueryClient();
  return useMutation<RecoveryPendingAction, Error, string>({
    mutationFn: (id) => apiFetch(`/recovery/pending-actions/${id}/cancel`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["insights", "chat"] }),
  });
}
