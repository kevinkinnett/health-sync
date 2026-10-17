import type {
  DossierContent,
  DossierEntry,
  DossierItemType,
} from "@health-dashboard/shared";
import { logger } from "../logger.js";
import type {
  DossierUsageRow,
  DossierUsageStatus,
  UpsertDossierInput,
} from "../repositories/dossierRepo.js";
import type { DossierItemReader } from "./dossierItemReader.js";
import {
  appendDossierRetryNudge,
  buildDossierPrompt,
} from "./dossierPrompt.js";
import {
  decodeDossierResponse,
  DossierResponseError,
} from "./dossierResponse.js";
import type {
  ChatCompleter,
  ChatCompletionResponse,
  ChatMessage,
  ModelSource,
} from "./llmClient.js";
import { LlmHttpError, resolveModel } from "./llmClient.js";
import { LlmStreamError } from "./llm/errors.js";

/**
 * Per-call upstream timeout. A dossier is a single large completion, so it
 * gets more room than a chat round (90s), but far less than the transport's
 * 5-minute default — a hung proxy should fail the request, not hold it.
 */
export const DOSSIER_CALL_TIMEOUT_MS = 3 * 60 * 1000;
/** Wall-clock budget for the whole refresh, including the decode retry. */
export const DOSSIER_TOTAL_BUDGET_MS = 4 * 60 * 1000;
/** Don't start a decode retry with less time than this left. */
const MIN_RETRY_BUDGET_MS = 30 * 1000;

/** Classifies a chatCompletion failure for usage accounting. */
function transportFailure(error: unknown): {
  status: DossierUsageStatus;
  message: string;
} {
  if (error instanceof LlmHttpError) {
    return { status: "http_error", message: `LLM proxy error ${error.status}` };
  }
  if (error instanceof LlmStreamError) {
    return { status: "stream_error", message: `LLM stream failed (${error.errorType})` };
  }
  const name = (error as Error | undefined)?.name;
  if (name === "AbortError" || name === "TimeoutError") {
    return { status: "timeout", message: "LLM proxy timed out" };
  }
  return { status: "network_error", message: "LLM proxy unreachable" };
}

/** The persistence capability required by the dossier workflow. */
export interface DossierStore {
  get(type: DossierItemType, id: number): Promise<DossierEntry | null>;
  delete(type: DossierItemType, id: number): Promise<boolean>;
  upsert(input: UpsertDossierInput): Promise<DossierEntry>;
  recordUsage(row: DossierUsageRow): Promise<void>;
}

/** A usable dossier could not be obtained from the upstream LLM. */
export class DossierFetchError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DossierFetchError";
  }
}

export class DossierNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DossierNotFoundError";
  }
}

export interface DossierServiceOptions {
  /** Static model id or resolver evaluated for every refresh. */
  model: ModelSource;
}

/** Coordinates dossier generation without owning prompt or decoding policy. */
export class DossierService {
  constructor(
    private readonly repo: DossierStore,
    private readonly items: DossierItemReader,
    private readonly llm: ChatCompleter,
    private readonly opts: DossierServiceOptions,
  ) {}

  get(type: DossierItemType, id: number): Promise<DossierEntry | null> {
    return this.repo.get(type, id);
  }

  async delete(type: DossierItemType, id: number): Promise<void> {
    await this.repo.delete(type, id);
  }

  /**
   * Look up an item, ask the LLM for a dossier, validate, persist, and return.
   * Invalid content is retried once; transport errors are surfaced immediately.
   */
  async refresh(type: DossierItemType, id: number): Promise<DossierEntry> {
    const context = await this.items.find(type, id);
    if (context == null) {
      throw new DossierNotFoundError(
        `${type === "supplement" ? "Supplement" : "Medication"} ${id} not found`,
      );
    }

    const item = context.item;
    const baseMessages = buildDossierPrompt(context);
    const model = await resolveModel(this.opts.model);
    const start = Date.now();
    let messages: ChatMessage[] = baseMessages;
    let lastError: DossierFetchError | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      const remainingMs = DOSSIER_TOTAL_BUDGET_MS - (Date.now() - start);
      if (attempt > 0 && remainingMs < MIN_RETRY_BUDGET_MS) break;
      let response: ChatCompletionResponse;
      try {
        response = await this.llm.chatCompletion(
          {
            model,
            messages,
            temperature: 0.1,
            max_tokens: 8000,
          },
          {
            task: "dossier",
            timeoutMs: Math.min(DOSSIER_CALL_TIMEOUT_MS, remainingMs),
          },
        );
      } catch (error) {
        // Every transport failure (HTTP status, mid-stream error, timeout,
        // network) is an upstream problem: account for the paid call and
        // surface it as a 502 rather than a generic 500.
        const failure = transportFailure(error);
        await this.recordUsage(type, id, model, start, failure.status);
        throw new DossierFetchError(failure.message, error);
      }

      const assistantContent = response.choices[0]?.message?.content;
      let content: DossierContent;
      try {
        content = decodeDossierResponse(assistantContent);
      } catch (error) {
        if (!(error instanceof DossierResponseError)) throw error;

        await this.recordUsage(type, id, model, start, error.status, response);
        messages = appendDossierRetryNudge(
          baseMessages,
          typeof assistantContent === "string" ? assistantContent : "",
        );
        lastError = new DossierFetchError(error.message, error);
        continue;
      }

      const entry = await this.repo.upsert({
        itemType: type,
        itemId: id,
        itemName: item.name,
        itemBrand: item.brand ?? null,
        itemForm: item.form ?? null,
        content,
        model: response.model ?? model,
        inputTokens: response.usage?.prompt_tokens ?? null,
        outputTokens: response.usage?.completion_tokens ?? null,
      });

      await this.recordUsage(type, id, model, start, "ok", response);
      return entry;
    }

    logger.warn(
      { type, id, lastErr: String(lastError) },
      "Dossier refresh failed after retry",
    );
    throw lastError ?? new DossierFetchError("Dossier refresh failed");
  }

  private recordUsage(
    type: DossierItemType,
    id: number,
    requestedModel: string,
    start: number,
    status: DossierUsageStatus,
    response?: ChatCompletionResponse,
  ): Promise<void> {
    return this.repo.recordUsage({
      itemType: type,
      itemId: id,
      requestedModel,
      actualModel: response?.model ?? null,
      promptTokens: response?.usage?.prompt_tokens,
      completionTokens: response?.usage?.completion_tokens,
      reasoningTokens:
        response?.usage?.completion_tokens_details?.reasoning_tokens,
      durationMs: Date.now() - start,
      status,
    });
  }
}
