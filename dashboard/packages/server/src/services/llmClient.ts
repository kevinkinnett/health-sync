import { logger } from "../logger.js";

/**
 * Thin wrapper around the local OpenAI-compatible Claude proxy
 * (see `claude-proxy` skill). Any new analytical workload that needs
 * an LLM round-trip should reuse this client rather than re-implementing
 * the request/response shape.
 *
 * Caller-side tools are intentionally NOT supported here — the dossier
 * task lets `claude -p` use its own internal WebSearch/WebFetch toolset.
 * If a future workload genuinely needs caller-side tools, extend the
 * interface; don't bolt them on at the call site.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
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

export class LlmClient {
  constructor(private readonly cfg: LlmClientConfig) {}

  async chatCompletion(
    req: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const url = `${this.cfg.baseUrl}/chat/completions`;
    const start = Date.now();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(req),
    });
    const duration = Date.now() - start;

    if (!response.ok) {
      const text = await response.text();
      logger.warn(
        { url, status: response.status, duration, model: req.model },
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
        requestedModel: req.model,
        responseModel: json.model,
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      },
      "LLM proxy response",
    );
    return json;
  }
}
