import { useMemo, useState } from "react";
import type {
  ChatExitReason,
  ChatTurn,
  RecoveryPendingAction,
} from "@health-dashboard/shared";
import {
  useChatConversation,
  useSendChatMessage,
} from "../../api/queries";

interface PendingChatMessage {
  isPending: boolean;
  message?: string;
}

export function buildOptimisticMessages(
  messages: ChatTurn[],
  pending: PendingChatMessage,
  now: () => string = () => new Date().toISOString(),
): ChatTurn[] {
  if (!pending.isPending || !pending.message) return [];
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.content === pending.message) return [];

  return [
    {
      role: "user",
      content: pending.message,
      createdAt: now(),
    },
  ];
}

export interface InsightChatState {
  conversationId: string | null;
  draft: string;
  historyOpen: boolean;
  isSending: boolean;
  messages: ChatTurn[];
  pendingActions: RecoveryPendingAction[];
  notice: ChatNotice | null;
  closeHistory: () => void;
  newChat: () => void;
  selectConversation: (id: string) => void;
  sendMessage: () => Promise<void>;
  setDraft: (value: string) => void;
  toggleHistory: () => void;
}

export interface ChatNotice {
  kind: "warning" | "error";
  title: string;
  message: string;
}

function placeholderNotice(reason: ChatExitReason | undefined): ChatNotice {
  switch (reason) {
    case "auth-required":
      return {
        kind: "warning",
        title: "AI service login required.",
        message:
          "Your message was saved. Sign in to the model service, then retry the request.",
      };
    case "llm-error":
      return {
        kind: "warning",
        title: "AI service unavailable.",
        message:
          "Your message was saved, but the model service could not complete it. Retry after the service reconnects.",
      };
    case "session-expired":
      return {
        kind: "warning",
        title: "AI session expired.",
        message: "Your message was saved. Retry it to start a fresh model session.",
      };
    case "wall-time":
      return {
        kind: "warning",
        title: "Analysis timed out.",
        message: "Your message was saved. Try again or narrow the request.",
      };
    case "stuck":
      return {
        kind: "warning",
        title: "Analysis stalled.",
        message:
          "The model repeated the same data requests. Try again or narrow the request.",
      };
    case "missing-tools":
      return {
        kind: "warning",
        title: "Required data was not used.",
        message:
          "The fallback response was saved. Try again or make the requested data more specific.",
      };
    case "round-limit":
      return {
        kind: "warning",
        title: "Analysis limit reached.",
        message:
          "The fallback response was saved; try a narrower follow-up if you need more detail.",
      };
    case "answered":
    default:
      return {
        kind: "warning",
        title: "Incomplete response.",
        message: "The fallback response was saved. Try the request again.",
      };
  }
}

export function useInsightChat(): InsightChatState {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const conversation = useChatConversation(conversationId);
  const send = useSendChatMessage();
  const persistedMessages = useMemo(
    () => conversation.data?.messages ?? [],
    [conversation.data?.messages],
  );
  const optimisticMessages = useMemo(
    () =>
      buildOptimisticMessages(persistedMessages, {
        isPending: send.isPending,
        message: send.variables?.message,
      }),
    [persistedMessages, send.isPending, send.variables?.message],
  );

  const sendMessage = async () => {
    const message = draft.trim();
    if (!message || send.isPending) return;

    setDraft("");
    try {
      const result = await send.mutateAsync({
        conversationId: conversationId ?? undefined,
        message,
      });
      setConversationId(result.conversationId);
    } catch {
      // React Query owns the error shown below. Restore the prompt so a
      // transient server/proxy failure never makes the user's text vanish.
      setDraft((current) => current || message);
    }
  };

  const notice = send.error
    ? {
        kind: "error" as const,
        title: "Chat request failed.",
        message: send.error.message,
      }
    : send.data?.meta.placeholder
      ? placeholderNotice(send.data.meta.exitReason)
      : null;

  return {
    conversationId,
    draft,
    historyOpen,
    isSending: send.isPending,
    messages: [...persistedMessages, ...optimisticMessages],
    pendingActions: conversation.data?.pendingActions ?? send.data?.pendingActions ?? [],
    notice,
    closeHistory: () => setHistoryOpen(false),
    newChat: () => {
      setConversationId(null);
      setDraft("");
      if (!send.isPending) send.reset();
    },
    selectConversation: (id) => {
      setConversationId(id);
      setHistoryOpen(false);
      if (!send.isPending) send.reset();
    },
    sendMessage,
    setDraft,
    toggleHistory: () => setHistoryOpen((current) => !current),
  };
}
