import { useMemo, useState } from "react";
import type { ChatTurn } from "@health-dashboard/shared";
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
    const result = await send.mutateAsync({
      conversationId: conversationId ?? undefined,
      message,
    });
    setConversationId(result.conversationId);
  };

  return {
    conversationId,
    draft,
    historyOpen,
    isSending: send.isPending,
    messages: [...persistedMessages, ...optimisticMessages],
    closeHistory: () => setHistoryOpen(false),
    newChat: () => {
      setConversationId(null);
      setDraft("");
    },
    selectConversation: (id) => {
      setConversationId(id);
      setHistoryOpen(false);
    },
    sendMessage,
    setDraft,
    toggleHistory: () => setHistoryOpen((current) => !current),
  };
}
