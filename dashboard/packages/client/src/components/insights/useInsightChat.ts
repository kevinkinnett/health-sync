import { useMemo, useState } from "react";
import type { ChatTurn, RecoveryPendingAction } from "@health-dashboard/shared";
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
  notice: { kind: "warning" | "error"; message: string } | null;
  closeHistory: () => void;
  newChat: () => void;
  selectConversation: (id: string) => void;
  sendMessage: () => Promise<void>;
  setDraft: (value: string) => void;
  toggleHistory: () => void;
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
    ? { kind: "error" as const, message: send.error.message }
    : send.data?.meta.placeholder
      ? {
          kind: "warning" as const,
          message:
            "The fallback response was saved; try a narrower follow-up if you need more detail.",
        }
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
