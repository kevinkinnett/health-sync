export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    /** JSON-string of the arguments object — OpenAI convention. */
    arguments: string;
  };
}

export interface ChatMessage {
  role: ChatMessageRole;
  /** Null is permitted on assistant rows that emitted tool_calls only. */
  content: string | null;
  /** Populated on assistant turns that called tools. */
  tool_calls?: ToolCall[];
  /** Populated on `role=tool` turns. */
  tool_call_id?: string;
  /** Convenience for callers; ignored on the wire. */
  name?: string;
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export type ToolChoice = "auto" | "none" | "required";

/** A model id, or a resolver evaluated per request (e.g. read from settings). */
export type ModelSource = string | (() => string | Promise<string>);

/** Normalize a {@link ModelSource} to a concrete model id. */
export async function resolveModel(source: ModelSource): Promise<string> {
  return typeof source === "function" ? source() : source;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Anthropic requires this; the codec applies a default when unset. */
  max_tokens?: number;
  tools?: ToolDef[];
  tool_choice?: ToolChoice;
  /** Maps to Anthropic extended thinking (`thinking: {type:"enabled"}`). */
  enable_thinking?: boolean;
  thinking_budget?: number;
}

export interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface ChatCompletionChoice {
  message: {
    role?: string;
    content: string | null;
    reasoning_content?: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason?: string;
}

export interface ChatCompletionResponse {
  id?: string;
  model?: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

export interface LlmClientConfig {
  /** Base URL of the Anthropic-compatible proxy (a trailing `/v1` is ok). */
  baseUrl: string;
  apiKey: string;
}

/** Per-task tagging keeps logging and telemetry consistent across consumers. */
export type LlmTask = "chat" | "insights" | "categorize" | "dossier";

export interface LlmCallOptions {
  task: LlmTask;
  /** Aborts the upstream request after `timeoutMs` (default 5min). */
  timeoutMs?: number;
  /** Number of retries after the initial request for transient failures. */
  retries?: number;
}

/** The provider-neutral capability consumed by the application services. */
export interface ChatCompleter {
  chatCompletion(
    req: ChatCompletionRequest,
    opts?: LlmCallOptions,
  ): Promise<ChatCompletionResponse>;
}
