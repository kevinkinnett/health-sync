import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  InsightGeneration,
  InsightGenerationSummary,
  InsightJob,
  ChatConversationSummary,
  ChatConversationResponse,
  ChatSendResponse,
} from "@health-dashboard/shared";
import { apiFetch } from "../client";

// ---------------------------------------------------------------------------
// AI Insights + Chat
// ---------------------------------------------------------------------------

export function useInsightGenerations() {
  return useQuery<InsightGenerationSummary[]>({
    queryKey: ["insights", "list"],
    queryFn: () => apiFetch(`/insights/list`),
  });
}

export function useInsightGeneration(generationId: string | null) {
  return useQuery<InsightGeneration>({
    queryKey: ["insights", "get", generationId],
    queryFn: () => apiFetch(`/insights/${generationId}`),
    enabled: generationId != null,
  });
}

export function useStartInsightGeneration() {
  const queryClient = useQueryClient();
  return useMutation<{ jobId: string }, Error, { dateFrom?: string; dateTo?: string } | void>({
    mutationFn: (body) =>
      apiFetch(`/insights/generate`, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

export function useInsightJob(jobId: string | null) {
  return useQuery<InsightJob>({
    queryKey: ["insights", "job", jobId],
    queryFn: () => apiFetch(`/insights/generate/status/${jobId}`),
    enabled: jobId != null,
    // Poll every 2s while pending/running. The page-level component
    // clears `jobId` once the job reaches a terminal status.
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2000;
      if (data.status === "completed" || data.status === "failed") return false;
      return 2000;
    },
  });
}

export function useDeleteInsightGeneration() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: number }, Error, string>({
    mutationFn: (id) =>
      apiFetch(`/insights/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

// ------ Chat ------

export function useChatConversations() {
  return useQuery<ChatConversationSummary[]>({
    queryKey: ["insights", "chat", "list"],
    queryFn: () => apiFetch(`/insights/chat/conversations`),
  });
}

export function useChatConversation(conversationId: string | null) {
  return useQuery<ChatConversationResponse>({
    queryKey: ["insights", "chat", "get", conversationId],
    queryFn: () => apiFetch(`/insights/chat/${conversationId}`),
    enabled: conversationId != null,
  });
}

export function useSendChatMessage() {
  const queryClient = useQueryClient();
  return useMutation<
    ChatSendResponse,
    Error,
    { conversationId?: string; message: string }
  >({
    mutationFn: (body) =>
      apiFetch(`/insights/chat`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data, variables) => {
      // Retain the authoritative POST response immediately. The subsequent
      // invalidation reconciles timestamps with the database, but a delayed
      // or failed refetch must not make an assistant response disappear.
      queryClient.setQueryData<ChatConversationResponse>(
        ["insights", "chat", "get", data.conversationId],
        (current) => {
          const messages = [...(current?.messages ?? [])];
          const last = messages[messages.length - 1];
          if (last?.role !== "user" || last.content !== variables.message) {
            messages.push({
              role: "user",
              content: variables.message,
              createdAt: new Date().toISOString(),
            });
          }
          const latest = messages[messages.length - 1];
          if (
            latest?.role !== "assistant" ||
            latest.content !== data.message.content
          ) {
            messages.push({
              ...data.message,
              createdAt: new Date().toISOString(),
            });
          }
          return {
            conversationId: data.conversationId,
            messages,
            pendingActions: data.pendingActions,
          };
        },
      );
      queryClient.invalidateQueries({ queryKey: ["insights", "chat", "list"] });
      queryClient.invalidateQueries({
        queryKey: ["insights", "chat", "get", data.conversationId],
      });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation<{ deleted: number }, Error, string>({
    mutationFn: (id) =>
      apiFetch(`/insights/chat/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights", "chat"] });
    },
  });
}
