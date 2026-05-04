import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useChatConversation,
  useChatConversations,
  useDeleteConversation,
  useDeleteInsightGeneration,
  useInsightGeneration,
  useInsightGenerations,
  useInsightJob,
  useSendChatMessage,
  useStartInsightGeneration,
  type ChatMessageRow,
} from "../api/queries";

// ---------------------------------------------------------------------------
// Top-level page
// ---------------------------------------------------------------------------

type Tab = "reports" | "chat";

export function Insights() {
  const [tab, setTab] = useState<Tab>("reports");
  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="font-headline text-3xl font-bold text-on-surface tracking-tight mb-2 flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              auto_awesome
            </span>
            AI Insights
          </h1>
          <p className="text-on-surface-variant text-lg">
            LLM-narrated reports across six dimensions, plus open-ended chat
            grounded in your real Fitbit + supplements + medications data.
          </p>
        </div>
        <TabSwitcher value={tab} onChange={setTab} />
      </header>

      {tab === "reports" ? <ReportsTab /> : <ChatTab />}
    </div>
  );
}

function TabSwitcher({
  value,
  onChange,
}: {
  value: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Insights tabs"
      className="inline-flex bg-surface-container-low rounded-xl p-1 border border-outline-variant/10"
    >
      <button
        role="tab"
        aria-selected={value === "reports"}
        onClick={() => onChange("reports")}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
          value === "reports"
            ? "bg-surface-container shadow text-on-surface"
            : "text-outline hover:text-on-surface"
        }`}
      >
        <span className="material-symbols-outlined text-base">bar_chart</span>
        Reports
      </button>
      <button
        role="tab"
        aria-selected={value === "chat"}
        onClick={() => onChange("chat")}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
          value === "chat"
            ? "bg-surface-container shadow text-on-surface"
            : "text-outline hover:text-on-surface"
        }`}
      >
        <span className="material-symbols-outlined text-base">chat</span>
        Chat
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports tab
// ---------------------------------------------------------------------------

const JOB_STORAGE_KEY = "vitalis.insights.job";

interface PersistedJob {
  jobId: string;
  startedAt: string;
}

function ReportsTab() {
  const list = useInsightGenerations();
  const [activeIndex, setActiveIndex] = useState(0);

  // Persist in-flight jobId so a navigation/refresh resumes polling
  // rather than orphaning the running generation.
  const [persistedJob, setPersistedJob] = useState<PersistedJob | null>(() => {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(JOB_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PersistedJob;
    } catch {
      return null;
    }
  });

  const job = useInsightJob(persistedJob?.jobId ?? null);
  const start = useStartInsightGeneration();
  const del = useDeleteInsightGeneration();

  useEffect(() => {
    if (!job.data) return;
    if (job.data.status === "completed" || job.data.status === "failed") {
      // Job finished — clear persistence and jump to newest generation.
      setPersistedJob(null);
      localStorage.removeItem(JOB_STORAGE_KEY);
      setActiveIndex(0);
      list.refetch();
    }
  }, [job.data, list]);

  const generations = list.data ?? [];
  const activeSummary = generations[activeIndex];
  const detail = useInsightGeneration(activeSummary?.generationId ?? null);

  const onRegenerate = async () => {
    const result = await start.mutateAsync();
    const persisted: PersistedJob = {
      jobId: result.jobId,
      startedAt: new Date().toISOString(),
    };
    localStorage.setItem(JOB_STORAGE_KEY, JSON.stringify(persisted));
    setPersistedJob(persisted);
  };

  const onDelete = async () => {
    if (!activeSummary) return;
    if (
      !window.confirm(
        `Delete this analysis from ${activeSummary.createdAt.slice(0, 10)}?`,
      )
    )
      return;
    await del.mutateAsync(activeSummary.generationId);
    setActiveIndex(0);
  };

  const inFlight = job.data?.status === "running" || job.data?.status === "pending";

  return (
    <div className="space-y-4">
      {inFlight && job.data && <ProgressCard job={job.data} />}

      {!inFlight && job.data?.status === "failed" && (
        <div className="bg-error/10 border border-error/30 rounded-xl p-4 text-sm text-error">
          Generation failed: {job.data.error ?? "unknown error"}
        </div>
      )}

      <header className="bg-surface-container rounded-xl p-5 border border-outline-variant/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-on-surface">
          {activeSummary ? (
            <>
              <span className="font-bold">
                {new Date(activeSummary.createdAt).toLocaleString()}
              </span>
              <span className="ml-2 inline-block text-[10px] uppercase tracking-widest font-bold text-outline bg-surface-container-low px-2 py-0.5 rounded">
                {activeSummary.dateFrom} → {activeSummary.dateTo}
              </span>
            </>
          ) : list.isLoading ? (
            <span className="text-outline">Loading analyses…</span>
          ) : (
            <span className="text-outline">No analyses yet — click Regenerate to create the first.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {generations.length > 0 && (
            <>
              <button
                onClick={() =>
                  setActiveIndex((i) => Math.min(generations.length - 1, i + 1))
                }
                disabled={activeIndex >= generations.length - 1}
                aria-label="Older analysis"
                className="p-1 text-outline hover:text-on-surface disabled:opacity-30"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <span className="text-xs tabular-nums text-outline">
                {activeIndex + 1} / {generations.length}
              </span>
              <button
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                disabled={activeIndex === 0}
                aria-label="Newer analysis"
                className="p-1 text-outline hover:text-on-surface disabled:opacity-30"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </>
          )}
          <button
            onClick={onRegenerate}
            disabled={inFlight || start.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary-fixed rounded-lg text-sm font-bold disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">
              {inFlight ? "hourglass_empty" : "auto_awesome"}
            </span>
            {inFlight ? "Generating…" : "Regenerate"}
          </button>
          {activeSummary && (
            <button
              onClick={onDelete}
              aria-label="Delete this analysis"
              className="p-2 text-outline hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined">delete</span>
            </button>
          )}
        </div>
      </header>

      {detail.data && <CategoryAccordion categories={detail.data.categories} />}

      {!detail.data && !list.isLoading && generations.length === 0 && !inFlight && (
        <div className="bg-surface-container rounded-xl p-12 text-center border border-outline-variant/10">
          <div className="text-outline mb-4">
            <span
              className="material-symbols-outlined text-5xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              auto_awesome
            </span>
          </div>
          <p className="text-on-surface-variant mb-4">
            No analyses yet. Generate the first one to see what's been
            happening with your activity, sleep, recovery, and lifestyle.
          </p>
          <button
            onClick={onRegenerate}
            className="px-6 py-2.5 bg-primary text-on-primary-fixed rounded-lg text-sm font-bold"
          >
            Generate First Analysis
          </button>
        </div>
      )}
    </div>
  );
}

function ProgressCard({
  job,
}: {
  job: NonNullable<ReturnType<typeof useInsightJob>["data"]>;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-surface-container rounded-xl p-5 border border-outline-variant/10"
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          className="material-symbols-outlined text-primary animate-pulse"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
        <div className="flex-1">
          <div className="font-bold text-on-surface">Analyzing your health data</div>
          <div className="text-xs text-outline">
            Started {new Date(job.startedAt).toLocaleTimeString()}
          </div>
        </div>
        <div className="text-sm font-bold tabular-nums text-primary">
          {job.progress}%
        </div>
      </div>
      <div
        className="h-2 bg-surface-container-lowest rounded-full overflow-hidden mb-2"
        aria-label={`Progress: ${job.progress}%`}
      >
        <div
          className="h-full bg-primary rounded-full transition-[width] duration-500"
          style={{ width: `${job.progress}%` }}
        />
      </div>
      <div className="text-xs text-outline">{job.statusMessage}</div>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  activity: "#c0c1ff",
  sleep: "#4edea3",
  cardiovascular: "#ffb2b7",
  body_composition: "#c0c1ff",
  lifestyle: "#4edea3",
  trends: "#ffb2b7",
};

function CategoryAccordion({
  categories,
}: {
  categories: Array<{ key: string; title: string; content: string }>;
}) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(categories.length > 0 ? [categories[0].key] : []),
  );

  return (
    <div className="space-y-2">
      {categories.map((cat) => {
        const isOpen = open.has(cat.key);
        const color = CATEGORY_COLORS[cat.key] ?? "#c0c1ff";
        return (
          <div
            key={cat.key}
            className="bg-surface-container rounded-xl border border-outline-variant/10 overflow-hidden"
          >
            <button
              onClick={() => {
                const next = new Set(open);
                isOpen ? next.delete(cat.key) : next.add(cat.key);
                setOpen(next);
              }}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 p-4 hover:bg-surface-container-high transition-colors text-left"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: color }}
              />
              <span className="flex-1 font-headline font-semibold text-on-surface">
                {cat.title}
              </span>
              <span
                className={`material-symbols-outlined text-outline transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              >
                expand_more
              </span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-1 text-sm text-on-surface markdown-body">
                <MarkdownBody>{cat.content}</MarkdownBody>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat tab
// ---------------------------------------------------------------------------

const EXAMPLE_QUESTIONS = [
  "How is my sleep trending vs last month?",
  "Which day of the week am I most active?",
  "Did taking magnesium correlate with better sleep?",
  "What's my best step day this year?",
  "How is my resting heart rate compared to 30 days ago?",
  "Have I been hitting 10k steps consistently?",
];

function ChatTab() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const conv = useChatConversation(conversationId);
  const send = useSendChatMessage();

  const onSend = async () => {
    const message = draft.trim();
    if (!message || send.isPending) return;
    setDraft("");
    const result = await send.mutateAsync({
      conversationId: conversationId ?? undefined,
      message,
    });
    setConversationId(result.conversationId);
  };

  const onExample = (q: string) => {
    setDraft(q);
  };

  const messages = conv.data?.messages ?? [];
  // Optimistic + pending message rendering.
  const optimistic: ChatMessageRow[] = useMemo(() => {
    if (!send.isPending) return [];
    const lastIsOurs =
      messages.length > 0 && messages[messages.length - 1].content === send.variables?.message;
    if (lastIsOurs) return [];
    if (!send.variables?.message) return [];
    return [
      {
        role: "user",
        content: send.variables.message,
        createdAt: new Date().toISOString(),
      },
    ];
  }, [messages, send.isPending, send.variables]);

  return (
    <div className="bg-surface-container rounded-xl border border-outline-variant/10 flex flex-col h-[70vh]">
      <header className="flex items-center justify-between p-4 border-b border-outline-variant/10 relative">
        <div className="flex items-center gap-2">
          <span className="font-headline font-semibold text-on-surface">
            {conversationId ? "Conversation" : "New Chat"}
          </span>
          {messages.length > 0 && (
            <span className="text-[10px] uppercase tracking-widest font-bold text-outline bg-surface-container-low px-2 py-0.5 rounded">
              {messages.length} msg
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            aria-label="Conversation history"
            className="p-2 text-outline hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">schedule</span>
          </button>
          <button
            onClick={() => {
              setConversationId(null);
              setDraft("");
            }}
            aria-label="New chat"
            className="p-2 text-outline hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
        {historyOpen && (
          <HistoryDropdown
            onPick={(id) => {
              setConversationId(id);
              setHistoryOpen(false);
            }}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </header>

      <MessagesArea
        messages={[...messages, ...optimistic]}
        empty={!conversationId && messages.length === 0}
        loading={send.isPending}
        onExample={onExample}
      />

      <ChatInput
        value={draft}
        onChange={setDraft}
        onSend={onSend}
        disabled={send.isPending}
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
  const del = useDeleteConversation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
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
        <div className="text-xs text-outline p-3">No previous conversations.</div>
      ) : (
        (list.data ?? []).map((c) => (
          <div
            key={c.conversationId}
            className="flex items-start gap-2 p-2 rounded-lg hover:bg-surface-container transition-colors"
          >
            <button
              onClick={() => onPick(c.conversationId)}
              className="flex-1 text-left"
            >
              <div className="text-sm text-on-surface line-clamp-2">
                {c.preview}
              </div>
              <div className="text-[10px] text-outline tabular-nums mt-0.5">
                {new Date(c.lastMessageAt).toLocaleString()} · {c.messageCount} msg
              </div>
            </button>
            <button
              onClick={() => del.mutate(c.conversationId)}
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
  messages: ChatMessageRow[];
  empty: boolean;
  loading: boolean;
  onExample: (q: string) => void;
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => onExample(q)}
                className="text-left text-sm p-3 bg-surface-container-low rounded-lg border border-outline-variant/10 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((m, i) => <MessageBubble key={i} message={m} />)
      )}
      {loading && <TypingIndicator />}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessageRow }) {
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
    <div className="flex items-center gap-3" role="status" aria-label="Assistant is thinking">
      <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center shrink-0">
        <span
          className="material-symbols-outlined text-secondary text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          auto_awesome
        </span>
      </div>
      <div className="bg-surface-container-low rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
        <span className="w-2 h-2 bg-outline rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="w-2 h-2 bg-outline rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
        <span className="w-2 h-2 bg-outline rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div className="p-3 border-t border-outline-variant/10 flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
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

// ---------------------------------------------------------------------------
// Markdown wrapper — light styling so tables / bullets / inline code render
// ---------------------------------------------------------------------------

function MarkdownBody({ children }: { children: string }) {
  return (
    <div className="prose-insights">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
