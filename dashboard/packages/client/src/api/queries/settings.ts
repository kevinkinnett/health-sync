import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NotificationSettings, LlmModelSettings } from "@health-dashboard/shared";
import { apiFetch } from "../client";

// ---------------------------------------------------------------------------
// Notification settings (the Settings → Notifications control screen)
// ---------------------------------------------------------------------------

export function useNotificationSettings() {
  return useQuery<NotificationSettings>({
    queryKey: ["settings", "notifications"],
    queryFn: () => apiFetch(`/settings/notifications`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation<NotificationSettings, Error, NotificationSettings>({
    mutationFn: (body) =>
      apiFetch(`/settings/notifications`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => {
      // The server returns the clamped/normalised settings — seed the
      // cache with the canonical value so the form reflects any clamping.
      queryClient.setQueryData(["settings", "notifications"], saved);
    },
  });
}

/** Fire a one-off test push; resolves to the Apprise delivery status. */
export function useTestNotification() {
  return useMutation<{ delivered: boolean; status: number }, Error, void>({
    mutationFn: () =>
      apiFetch(`/settings/notifications/test`, { method: "POST" }),
  });
}

/** Per-task Claude model selection (dossier / insights / chat). */
export function useLlmModelSettings() {
  return useQuery<LlmModelSettings>({
    queryKey: ["settings", "llm-models"],
    queryFn: () => apiFetch(`/settings/llm-models`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateLlmModelSettings() {
  const queryClient = useQueryClient();
  return useMutation<LlmModelSettings, Error, LlmModelSettings>({
    mutationFn: (body) =>
      apiFetch(`/settings/llm-models`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings", "llm-models"], saved);
    },
  });
}
