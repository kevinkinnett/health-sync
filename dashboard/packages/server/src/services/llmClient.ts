import { logger } from "../logger.js";

/**
 * Thin wrapper around the Tailnet Claude proxy. The proxy now speaks ONLY
 * the Anthropic Messages API (`POST /v1/messages`, content-block format),
 * backed by the Claude Agent SDK on the Max subscription.
 *
 * To avoid rippling Anthropic's content-block shape through the agentic
 * loop and the three services, this client keeps an OpenAI-flavoured
 * PUBLIC contract ({@link ChatCompletionRequest} / {@link ChatCompletionResponse})
 * and translates at the wire boundary: OpenAI-shaped request → Anthropic
 * Messages request on the way out, Anthropic response → OpenAI-shaped
 * response on the way back. Callers are unchanged.
 */

// ---------------------------------------------------------------------------
// Message + tool shapes (OpenAI-flavoured public contract)
// ---------------------------------------------------------------------------

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
  /** Anthropic requires this; we apply {@link DEFAULT_MAX_TOKENS} when unset. */
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

export class LlmHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`LLM proxy returned ${status}: ${body.slice(0, 200)}`);
    this.name = "LlmHttpError";
  }
}

/**
 * The proxy keeps a mid-loop tool conversation in memory and correlates
 * the follow-up by tool_use_id. If it restarts (or the loop idles past
 * its ~10min TTL) between the tool_use turn and the tool_result, the
 * continuation returns 410 `session_expired`. Recovery is to replay the
 * conversation from the first user turn — a same-request retry just 410s
 * again — so this is surfaced for the agentic loop to handle, NOT auto-
 * retried at the transport level.
 */
export function isSessionExpired(err: unknown): boolean {
  return (
    err instanceof LlmHttpError && err.status === 410 && /session_expired/.test(err.body)
  );
}

export interface LlmClientConfig {
  /** Base URL of the Anthropic-compatible proxy (a trailing `/v1` is ok). */
  baseUrl: string;
  apiKey: string;
}

/** Anthropic requires max_tokens; the agentic loop sends none, so default. */
const DEFAULT_MAX_TOKENS = 8000;

// ---------------------------------------------------------------------------
// Anthropic Messages API wire shapes (internal)
// ---------------------------------------------------------------------------

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
  tools?: Array<{ name: string; description: string; input_schema: ToolDef["function"]["parameters"] }>;
  tool_choice?: { type: "auto" | "any" | "none" };
  thinking?: { type: "enabled"; budget_tokens: number };
}

interface AnthropicResponse {
  id?: string;
  model?: string;
  stop_reason?: string;
  content?: Array<{
    type: string;
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** OpenAI-shaped request → Anthropic Messages request. */
export function toAnthropicRequest(req: ChatCompletionRequest): AnthropicRequest {
  // System prompts are a top-level field in Anthropic, not a message row.
  const system = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content ?? "")
    .filter(Boolean)
    .join("\n\n");

  const messages: AnthropicMessage[] = [];
  for (const m of req.messages) {
    if (m.role === "system") continue;

    if (m.role === "tool") {
      // Tool results are user-turn content blocks; merge consecutive ones
      // (one assistant tool_use turn → one user turn with N tool_results).
      const block: AnthropicBlock = {
        type: "tool_result",
        tool_use_id: m.tool_call_id ?? "",
        content: m.content ?? "",
      };
      const last = messages[messages.length - 1];
      if (last && last.role === "user" && Array.isArray(last.content)) {
        last.content.push(block);
      } else {
        messages.push({ role: "user", content: [block] });
      }
      continue;
    }

    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      const blocks: AnthropicBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.tool_calls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: safeJsonParse(tc.function.arguments),
        });
      }
      messages.push({ role: "assistant", content: blocks });
      continue;
    }

    // Plain user / assistant text.
    messages.push({ role: m.role as "user" | "assistant", content: m.content ?? "" });
  }

  const out: AnthropicRequest = {
    model: req.model,
    max_tokens: req.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages,
  };
  if (system) out.system = system;
  if (req.tools?.length) {
    out.tools = req.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }
  // Only meaningful alongside a non-empty tools array — sending it with
  // no tools is a 400 ("tool_choice may only be specified when tools are
  // given"), which would turn a harmless empty-tools call into a hard
  // failure. Drop it instead.
  if (req.tool_choice && out.tools?.length) {
    out.tool_choice = {
      type: req.tool_choice === "required" ? "any" : req.tool_choice,
    };
  }
  if (req.enable_thinking) {
    // Thinking and temperature are mutually exclusive in Anthropic.
    out.thinking = { type: "enabled", budget_tokens: req.thinking_budget ?? 1024 };
  } else if (req.temperature != null) {
    out.temperature = req.temperature;
  }
  return out;
}

function mapStopReason(s?: string): string | undefined {
  switch (s) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
      return "length";
    default:
      return s;
  }
}

/** Anthropic Messages response → OpenAI-shaped response. */
export function fromAnthropicResponse(a: AnthropicResponse): ChatCompletionResponse {
  const text: string[] = [];
  const thinking: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const b of a.content ?? []) {
    if (b.type === "text" && typeof b.text === "string") text.push(b.text);
    else if (b.type === "thinking" && typeof b.thinking === "string") thinking.push(b.thinking);
    else if (b.type === "tool_use") {
      toolCalls.push({
        id: b.id ?? "",
        type: "function",
        function: { name: b.name ?? "", arguments: JSON.stringify(b.input ?? {}) },
      });
    }
  }
  const joined = text.join("");
  const inTok = a.usage?.input_tokens;
  const outTok = a.usage?.output_tokens;
  return {
    id: a.id,
    model: a.model,
    choices: [
      {
        message: {
          role: "assistant",
          // OpenAI convention: null content when the turn was tools-only.
          content: joined.length > 0 ? joined : toolCalls.length > 0 ? null : "",
          reasoning_content: thinking.length > 0 ? thinking.join("") : undefined,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
        finish_reason: mapStopReason(a.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: inTok,
      completion_tokens: outTok,
      total_tokens: inTok != null && outTok != null ? inTok + outTok : undefined,
    },
  };
}

/**
 * Per-task tagging keeps the same client usable for chat / insights /
 * categorize / dossier without each caller re-implementing logging
 * conventions. Tag values flow into structured logs so cost analysis
 * can group by task.
 */
export type LlmTask = "chat" | "insights" | "categorize" | "dossier";

export interface LlmCallOptions {
  task: LlmTask;
  /** Aborts the upstream request after `timeoutMs` (default 5min). */
  timeoutMs?: number;
  /**
   * Retry the request on transient 5xx errors. Off by default.
   * Insights / Chat opt in because the proxy occasionally returns 500
   * with transient errors that recover on retry. Backoff is
   * 500ms × 2^attempt, capped at 4s between attempts.
   */
  retries?: number;
}

const TRANSIENT_BACKOFF_MS = [500, 1500, 4000];

function isTransientError(err: unknown): boolean {
  // 5xx from the proxy is the documented self-recovering case.
  if (err instanceof LlmHttpError && err.status >= 500) return true;
  // Aborted (timeout) is NOT retryable — the underlying call is dead.
  return false;
}

/**
 * The only capability consumers actually need. The agentic loop and the
 * three LLM services depend on THIS, not on {@link LlmClient} — they have
 * no business knowing about base URLs, retry policy or the Anthropic wire
 * format, and typing them to the concrete class forced every test double
 * through an `as unknown as LlmClient` cast to satisfy private fields it
 * never used.
 */
export interface ChatCompleter {
  chatCompletion(
    req: ChatCompletionRequest,
    opts?: LlmCallOptions,
  ): Promise<ChatCompletionResponse>;
}

export class LlmClient implements ChatCompleter {
  constructor(private readonly cfg: LlmClientConfig) {}

  async chatCompletion(
    req: ChatCompletionRequest,
    opts: LlmCallOptions = { task: "chat" },
  ): Promise<ChatCompletionResponse> {
    const retries = Math.max(0, opts.retries ?? 0);
    let attempt = 0;
    while (true) {
      try {
        return await this.callOnce(req, opts);
      } catch (err) {
        if (attempt < retries && isTransientError(err)) {
          const backoff =
            TRANSIENT_BACKOFF_MS[Math.min(attempt, TRANSIENT_BACKOFF_MS.length - 1)];
          logger.warn(
            { attempt: attempt + 1, retries, task: opts.task, backoffMs: backoff },
            "LLM transient error, retrying",
          );
          await new Promise((r) => setTimeout(r, backoff));
          attempt++;
          continue;
        }
        throw err;
      }
    }
  }

  private async callOnce(
    req: ChatCompletionRequest,
    opts: LlmCallOptions,
  ): Promise<ChatCompletionResponse> {
    // The proxy's Messages endpoint is at <base>/v1/messages; tolerate a
    // baseUrl that already ends in /v1 (legacy config) by stripping it.
    const base = this.cfg.baseUrl.replace(/\/v1\/?$/, "");
    const url = `${base}/v1/messages`;
    const start = Date.now();
    const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    // The proxy doesn't enforce auth, but mirror the Anthropic SDK header
    // when a key is configured.
    if (this.cfg.apiKey) headers["x-api-key"] = this.cfg.apiKey;

    const body = JSON.stringify(toAnthropicRequest(req));

    // 5-minute hard ceiling for any single completion. Insights / chat
    // tool-calls can run long but we never want a hung upstream to
    // permanently pin a request handler.
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    // NB: the timeout must stay armed until the BODY is read, not just
    // until headers land — fetch() resolves on headers, so clearing it
    // here would leave a slow/hung body stream unbounded.
    let result: ChatCompletionResponse;
    let status: number;
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });
      } catch (err) {
        const duration = Date.now() - start;
        const aborted = controller.signal.aborted;
        logger.warn(
          {
            url,
            duration,
            model: req.model,
            task: opts.task,
            aborted,
            err: (err as Error).message,
          },
          aborted ? "LLM call aborted (timeout)" : "LLM fetch failed",
        );
        throw err;
      }
      status = response.status;

      if (!response.ok) {
        const text = await response.text();
        logger.warn(
          { url, status, duration: Date.now() - start, model: req.model, task: opts.task },
          "LLM proxy error",
        );
        throw new LlmHttpError(status, text);
      }

      const anthropic = (await response.json()) as AnthropicResponse;
      result = fromAnthropicResponse(anthropic);
    } finally {
      clearTimeout(timeoutHandle);
    }
    const duration = Date.now() - start;
    logger.debug(
      {
        url,
        status,
        duration,
        task: opts.task,
        requestedModel: req.model,
        responseModel: result.model,
        promptTokens: result.usage?.prompt_tokens,
        completionTokens: result.usage?.completion_tokens,
        toolsCalled: result.choices[0]?.message?.tool_calls?.length ?? 0,
      },
      "LLM proxy response",
    );
    return result;
  }
}
