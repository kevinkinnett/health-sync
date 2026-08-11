import { logger } from "../logger.js";
import {
  fromAnthropicResponse,
  toAnthropicRequest,
} from "./llm/anthropicCodec.js";
import type {
  ChatCompleter,
  ChatCompletionRequest,
  ChatCompletionResponse,
  LlmCallOptions,
  LlmClientConfig,
} from "./llm/contracts.js";
import {
  AnthropicHttpTransport,
  type AnthropicTransport,
} from "./llm/httpTransport.js";
import { withTransientLlmRetries } from "./llm/retryPolicy.js";

export * from "./llm/contracts.js";
export * from "./llm/errors.js";
export {
  DEFAULT_MAX_TOKENS,
  fromAnthropicResponse,
  toAnthropicRequest,
  type AnthropicBlock,
  type AnthropicMessage,
  type AnthropicRequest,
  type AnthropicResponse,
  type AnthropicResponseBlock,
} from "./llm/anthropicCodec.js";
export { accumulateAnthropicStream } from "./llm/anthropicStream.js";
export {
  AnthropicHttpTransport,
  type AnthropicTransport,
} from "./llm/httpTransport.js";
export {
  isTransientLlmError,
  retryBackoffMs,
  withTransientLlmRetries,
} from "./llm/retryPolicy.js";

/**
 * Provider-neutral completion façade.
 *
 * Application services keep their small {@link ChatCompleter} dependency while
 * request translation, streaming HTTP, and retry decisions live in focused
 * collaborators. The transport consumes Anthropic SSE internally and this
 * façade preserves the complete-response contract expected by the agent loop.
 */
export class LlmClient implements ChatCompleter {
  private readonly transport: AnthropicTransport;

  constructor(
    config: LlmClientConfig,
    transport?: AnthropicTransport,
  ) {
    this.transport = transport ?? new AnthropicHttpTransport(config);
  }

  async chatCompletion(
    request: ChatCompletionRequest,
    options: LlmCallOptions = { task: "chat" },
  ): Promise<ChatCompletionResponse> {
    const startedAt = Date.now();
    const retries = Math.max(0, options.retries ?? 0);
    const result = await withTransientLlmRetries(
      async () => {
        const response = await this.transport.complete(
          toAnthropicRequest(request),
          options,
        );
        return fromAnthropicResponse(response);
      },
      {
        retries,
        onRetry: ({ attempt, backoffMs }) => {
          logger.warn(
            {
              attempt,
              retries,
              task: options.task,
              backoffMs,
            },
            "LLM transient error, retrying",
          );
        },
      },
    );

    logger.debug(
      {
        duration: Date.now() - startedAt,
        task: options.task,
        requestedModel: request.model,
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
