import { useEffect, useRef } from "react";
import type { ChatTurn } from "@health-dashboard/shared";
import {
  useChatConversations,
  useDeleteConversation,
} from "../../api/queries";
import { MarkdownBody } from "./MarkdownBody";
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
    <div className="bg-surface-container rounded-xl border border-outline-variant/10 flex flex-col h-[70vh]">
      <header className="flex items-center justify-between p-4 border-b border-outline-variant/10 relative">
        <div className="flex items-center gap-2">
          <span className="font-headline font-semibold text-on-surface">
            {chat.conversationId ? "Conversation" : "New Chat"}
          </span>
          {chat.messages.length > 0 && (
            <span className="text-[10px] uppercase tracking-widest font-bold text-outline bg-surface-container-low px-2 py-0.5 rounded">
              {chat.messages.length} msg
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

      <ChatInput
        value={chat.draft}
        onChange={chat.setDraft}
        onSend={chat.sendMessage}
        disabled={chat.isSending}
      />
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
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-4 top-14 w-80 max-h-96 overflow-y-auto bg-surface-container-high rounded-xl border border-outline-variant/15 shadow-xl z-50 p-2"
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
            className="flex items-start gap-2 p-2 rounded-lg hover:bg-surface-container transition-colors"
          >
            <button
              onClick={() => onPick(conversation.conversationId)}
              className="flex-1 text-left"
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
              className="p-1 text-outline hover:text-error"
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
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {empty ? (
        <div className="h-full flex flex-col items-center justify-center gap-4 px-4">
          <span
            className="material-symbols-outlined text-primary text-5xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
          <p className="text-on-surface-variant text-center">
            Ask anything about your health data — sleep, activity, supplements,
            correlations between them.
          </p>
          <div
            data-testid="chat-example-questions"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl"
          >
            {EXAMPLE_QUESTIONS.map((question) => (
              <button
                key={question}
                onClick={() => onExample(question)}
                className="text-left text-sm p-3 bg-surface-container-low rounded-lg border border-outline-variant/10 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((message, index) => (
          <MessageBubble key={index} message={message} />
        ))
      )}
      {loading && <TypingIndicator />}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatTurn }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-primary text-on-primary-fixed text-sm px-3 py-2 rounded-2xl rounded-br-sm max-w-[80%] whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center shrink-0">
        <span
          className="material-symbols-outlined text-secondary text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
      </div>
      <div className="flex-1 bg-surface-container-low rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-on-surface markdown-body">
        <MarkdownBody>{message.content}</MarkdownBody>
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
      <div className="bg-surface-container-low rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
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
    <div className="p-3 border-t border-outline-variant/10 flex items-end gap-2">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void onSend();
          }
        }}
        placeholder="Ask about your health data… (Enter to send, Shift+Enter for newline)"
        rows={1}
        className="flex-1 resize-none bg-surface-container-lowest border border-outline-variant/10 rounded-xl px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary max-h-32"
      />
      <button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="w-10 h-10 rounded-full bg-primary text-on-primary-fixed flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
      >
        <span className="material-symbols-outlined text-base">send</span>
      </button>
    </div>
  );
}
