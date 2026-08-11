import { logger } from "../../logger.js";
import type { AnthropicRequest, AnthropicResponse } from "./anthropicCodec.js";
import { accumulateAnthropicStream } from "./anthropicStream.js";
import type { LlmCallOptions, LlmClientConfig } from "./contracts.js";
import { LlmHttpError, LlmStreamError } from "./errors.js";

export interface AnthropicTransport {
  complete(
    request: AnthropicRequest,
    options: LlmCallOptions,
  ): Promise<AnthropicResponse>;
}

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class AnthropicHttpTransport implements AnthropicTransport {
  private readonly url: string;

  constructor(
    private readonly config: LlmClientConfig,
    private readonly fetchImplementation: FetchImplementation = (input, init) =>
      globalThis.fetch(input, init),
  ) {
    const base = config.baseUrl.replace(/\/v1\/?$/, "");
    this.url = `${base}/v1/messages`;
  }

  async complete(
    request: AnthropicRequest,
    options: LlmCallOptions,
  ): Promise<AnthropicResponse> {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "anthropic-version": "2023-06-01",
    };
    if (this.config.apiKey) headers["x-api-key"] = this.config.apiKey;

    try {
      let response: Response;
      try {
        response = await this.fetchImplementation(this.url, {
          method: "POST",
          headers,
          body: JSON.stringify({ ...request, stream: true }),
          signal: controller.signal,
        });
      } catch (error) {
        const aborted = controller.signal.aborted;
        logger.warn(
          {
            url: this.url,
            duration: Date.now() - startedAt,
            model: request.model,
            task: options.task,
            aborted,
            err: (error as Error).message,
          },
          aborted ? "LLM call aborted (timeout)" : "LLM fetch failed",
        );
        throw error;
      }

      if (!response.ok) {
        const text = await response.text();
        logger.warn(
          {
            url: this.url,
            status: response.status,
            duration: Date.now() - startedAt,
            model: request.model,
            task: options.task,
          },
          "LLM proxy error",
        );
        throw new LlmHttpError(response.status, text);
      }

      if (!response.body) {
        throw new LlmStreamError(
          "protocol_error",
          "LLM proxy returned an empty streaming body",
          false,
        );
      }

      try {
        return await accumulateAnthropicStream(response.body);
      } catch (error) {
        logger.warn(
          {
            url: this.url,
            status: response.status,
            duration: Date.now() - startedAt,
            model: request.model,
            task: options.task,
            err: (error as Error).message,
          },
          "LLM response stream failed",
        );
        throw error;
      }
    } finally {
      // Keep the timeout armed until the complete response stream is consumed.
      clearTimeout(timeoutHandle);
    }
  }
}
