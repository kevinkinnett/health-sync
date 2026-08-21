/**
 * Wire types for the AI Insights "Chat" surface.
 *
 * The full server-side transcript also includes `role=tool` rows and
 * assistant rows that emitted tool_calls — those are persisted so the
 * agentic loop has grounded context on every turn, but they're never
 * shown to the user. These types describe the UI-visible projection
 * only: user prompts and assistant text.
 *
 * Distinct from `LlmClient.ChatMessage` (server-internal OpenAI-shape
 * with role/content/tool_calls/tool_call_id). That's the wire format
 * to the model proxy; this is the wire format between server and
 * dashboard.
 */

/** One user-visible turn of a chat conversation. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/**
 * Listing row for GET /api/insights/chat/conversations — drives the
 * history dropdown in the chat tab.
 */
export interface ChatConversationSummary {
  conversationId: string;
  /** First user prompt of the conversation, truncated for display. */
  preview: string;
  /** Count of user+assistant text turns only (tool turns excluded). */
  messageCount: number;
  lastMessageAt: string;
}

/** Response shape for GET /api/insights/chat/:conversationId. */
export interface ChatConversationResponse {
  conversationId: string;
  messages: ChatTurn[];
  pendingActions: import("./recovery.js").RecoveryPendingAction[];
}

/** Request body for POST /api/insights/chat. */
export interface ChatSendRequest {
  /** Omit to start a new conversation. */
  conversationId?: string;
  message: string;
}

/**
 * Response from POST /api/insights/chat. `meta` exposes loop-level
 * telemetry so the UI can warn the user when the model bailed (placeholder)
 * or when output was sanitized to strip leaked tool-call syntax.
 */
export interface ChatSendResponse {
  conversationId: string;
  message: { role: "assistant"; content: string };
  meta: {
    sanitized: boolean;
    placeholder: boolean;
    toolsCalled: string[];
    rounds: number;
  };
  pendingActions: import("./recovery.js").RecoveryPendingAction[];
}
