import { logger } from "../logger.js";

/**
 * Thin wrapper around the local OpenAI-compatible Claude proxy
 * (see `claude-proxy` skill). Any new analytical workload that needs
 * an LLM round-trip should reuse this client rather than re-implementing
 * the request/response shape.
 *
 * Supports plain text completion (used by the dossier feature) and
 * tool-calling (used by Insights + Chat). The proxy understands the
 * standard OpenAI `tools` / `tool_choice` fields and the DashScope
 * `enable_thinking` / `thinking_budget` extensions.
 */

// ---------------------------------------------------------------------------
// Message + tool shapes
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
  /** Convenience for callers; the proxy ignores it. */
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

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: ToolDef[];
  tool_choice?: ToolChoice;
  /** DashScope/Qwen extension passed through by the proxy. */
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

export interface LlmClientConfig {
  /** Base URL ending in /v1 (no trailing slash). */
  baseUrl: string;
  apiKey: string;
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
}

export class LlmClient {
  constructor(private readonly cfg: LlmClientConfig) {}

  async chatCompletion(
    req: ChatCompletionRequest,
    opts: LlmCallOptions = { task: "chat" },
  ): Promise<ChatCompletionResponse> {
    const url = `${this.cfg.baseUrl}/chat/completions`;
    const start = Date.now();
    const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.cfg.apiKey) {
      headers.Authorization = `Bearer ${this.cfg.apiKey}`;
    }

    // 5-minute hard ceiling for any single completion. Insights /
    // chat tool-calls can run long but we never want a hung upstream
    // to permanently pin a request handler.
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(req),
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
    } finally {
      clearTimeout(timeoutHandle);
    }
    const duration = Date.now() - start;

    if (!response.ok) {
      const text = await response.text();
      logger.warn(
        {
          url,
          status: response.status,
          duration,
          model: req.model,
          task: opts.task,
        },
        "LLM proxy error",
      );
      throw new LlmHttpError(response.status, text);
    }

    const json = (await response.json()) as ChatCompletionResponse;
    logger.debug(
      {
        url,
        status: response.status,
        duration,
        task: opts.task,
        requestedModel: req.model,
        responseModel: json.model,
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
        thinkingTokens: json.usage?.completion_tokens_details?.reasoning_tokens,
        toolsCalled: json.choices[0]?.message?.tool_calls?.length ?? 0,
      },
      "LLM proxy response",
    );
    return json;
  }
}
