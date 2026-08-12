import { useEffect, useRef } from "react";
import type { ChatTurn } from "@health-dashboard/shared";
import {
  useChatConversations,
  useDeleteConversation,
} from "../../api/queries";
import { AutoGrowTextarea } from "../ui/AutoGrowTextarea";
import { Card } from "../ui/Card";
import { MarkdownContent } from "../ui/MarkdownContent";
import { useInsightChat } from "./useInsightChat";

const EXAMPLE_QUESTIONS = [
  "How is my sleep trending vs last month?",
  "Which day of the week am I most active?",
  "Did taking magnesium correlate with better sleep?",
  "What's my best step day this year?",
  "How is my resting heart rate compared to 30 days ago?",
  "Have I been hitting 10k steps consistently?",
];

export function ChatTab() {
  const chat = useInsightChat();

  return (
    <Card
      as="div"
      className="flex h-96 flex-none flex-col overflow-hidden sm:h-full sm:min-h-[28rem] sm:max-h-[56rem]"
    >
      <header className="flex items-center justify-between p-4 border-b border-outline-variant/10 relative">
        <div className="flex items-center gap-2">
          <span className="font-headline font-semibold text-on-surface">
            {chat.conversationId ? "Conversation" : "New Chat"}
          </span>
          {chat.messages.length > 0 && (
            <span className="text-[10px] uppercase tracking-widest font-bold text-outline bg-surface-container-low px-2 py-0.5 rounded">
              {chat.messages.length} {chat.messages.length === 1 ? "msg" : "msgs"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={chat.toggleHistory}
            aria-label="Conversation history"
            className="p-2 text-outline hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">schedule</span>
          </button>
          <button
            onClick={chat.newChat}
            aria-label="New chat"
            className="p-2 text-outline hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
        {chat.historyOpen && (
          <HistoryDropdown
            onPick={chat.selectConversation}
            onClose={chat.closeHistory}
          />
        )}
      </header>

      <MessagesArea
        messages={chat.messages}
        empty={!chat.conversationId && chat.messages.length === 0}
        loading={chat.isSending}
        onExample={chat.setDraft}
      />

      {chat.notice && <ChatNotice notice={chat.notice} />}

      <ChatInput
        value={chat.draft}
        onChange={chat.setDraft}
        onSend={chat.sendMessage}
        disabled={chat.isSending}
      />
    </Card>
  );
}

function ChatNotice({
  notice,
}: {
  notice: { kind: "warning" | "error"; message: string };
}) {
  const error = notice.kind === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mx-3 mb-2 rounded-lg border px-3 py-2 text-xs ${
        error
          ? "border-error/30 bg-error/10 text-error"
          : "border-tertiary/30 bg-tertiary/10 text-on-surface-variant"
      }`}
    >
      <span className="font-bold">
        {error ? "Chat request failed. " : "Analysis limit reached. "}
      </span>
      {notice.message}
    </div>
  );
}

function HistoryDropdown({
  onPick,
  onClose,
}: {
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const list = useChatConversations();
  const remove = useDeleteConversation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute left-3 right-3 top-14 z-50 max-h-[min(24rem,60dvh)] overflow-y-auto rounded-xl border border-outline-variant/15 bg-surface-container-high p-2 shadow-xl sm:left-auto sm:right-4 sm:w-96"
    >
      {list.isLoading ? (
        <div className="text-xs text-outline p-3">Loading…</div>
      ) : (list.data ?? []).length === 0 ? (
        <div className="text-xs text-outline p-3">
          No previous conversations.
        </div>
      ) : (
        (list.data ?? []).map((conversation) => (
          <div
            key={conversation.conversationId}
              className="flex items-start gap-2 rounded-lg p-2 transition-colors hover:bg-surface-container"
          >
            <button
              onClick={() => onPick(conversation.conversationId)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="text-sm text-on-surface line-clamp-2">
                {conversation.preview}
              </div>
              <div className="text-[10px] text-outline tabular-nums mt-0.5">
                {new Date(conversation.lastMessageAt).toLocaleString()} ·{" "}
                {conversation.messageCount} msg
              </div>
            </button>
            <button
              onClick={() => remove.mutate(conversation.conversationId)}
              aria-label="Delete conversation"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-outline transition-colors hover:bg-error/10 hover:text-error"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function MessagesArea({
  messages,
  empty,
  loading,
  onExample,
}: {
  messages: ChatTurn[];
  empty: boolean;
  loading: boolean;
  onExample: (question: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const lastMessageContent = messages.at(-1)?.content;
  useEffect(() => {
    if (
      scrollRef.current &&
      pinnedToBottom.current &&
      (messages.length > 0 || loading)
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, lastMessageContent, loading]);

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const element = event.currentTarget;
        pinnedToBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}
      className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-5"
    >
      {empty ? (
        <div className="flex min-h-full flex-col items-center justify-start gap-4 px-0 py-6 sm:justify-center sm:px-4">
          <span
            className="material-symbols-outlined text-primary text-5xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
          <p className="max-w-xl text-center leading-relaxed text-on-surface-variant">
            Ask anything about your health data — sleep, activity, supplements,
            correlations between them.
          </p>
          <div
            data-testid="chat-example-questions"
            className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {EXAMPLE_QUESTIONS.map((question) => (
              <button
                key={question}
                onClick={() => onExample(question)}
                className="rounded-xl border border-outline-variant/10 bg-surface-container-low p-3 text-left text-sm leading-relaxed text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((message, index) => (
          <MessageBubble
            key={`${message.role}-${message.createdAt ?? index}`}
            message={message}
          />
        ))
      )}
      {loading && <TypingIndicator />}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatTurn }) {
  if (message.role === "user") {
    return (
      <div className="flex min-w-0 justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm leading-relaxed text-on-primary-fixed sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center shrink-0">
        <span
          className="material-symbols-outlined text-secondary text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
      </div>
      <div className="min-w-0 max-w-[80ch] rounded-2xl rounded-tl-sm bg-surface-container-low px-4 py-3 text-on-surface">
        <MarkdownContent>{message.content}</MarkdownContent>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-3"
      role="status"
      aria-label="Assistant is thinking"
    >
      <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center shrink-0">
        <span
          className="material-symbols-outlined text-secondary text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
      </div>
      <div className="flex items-center gap-3 rounded-2xl rounded-tl-sm bg-surface-container-low px-4 py-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span
            className="w-2 h-2 bg-outline rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 bg-outline rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 bg-outline rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
        <span className="text-xs text-on-surface-variant">
          Analyzing your health data…
        </span>
      </div>
    </div>
  );
}

function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => Promise<void>;
  disabled: boolean;
}) {
  return (
    <div className="flex items-end gap-2 border-t border-outline-variant/10 bg-surface-container-low/35 p-3">
      <div className="min-w-0 flex-1">
        <AutoGrowTextarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void onSend();
            }
          }}
          maxHeight={160}
          aria-label="Ask about your health data"
          placeholder="Ask about your health data…"
          className="block min-h-11 w-full resize-none rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3 py-2.5 text-sm leading-5 text-on-surface placeholder:text-outline focus:border-primary focus:outline-none"
        />
        <p className="mt-1.5 hidden px-1 text-[10px] text-outline sm:block">
          Enter to send · Shift+Enter for a new line
        </p>
      </div>
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary-fixed transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <span className="material-symbols-outlined text-base">send</span>
      </button>
    </div>
  );
}
