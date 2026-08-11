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
      let response: ChatCompletionResponse;
      try {
        response = await this.llm.chatCompletion(
          {
            model,
            messages,
            temperature: 0.1,
            max_tokens: 8000,
          },
          { task: "dossier" },
        );
      } catch (error) {
        if (!(error instanceof LlmHttpError)) throw error;

        await this.recordUsage(type, id, model, start, "http_error");
        throw new DossierFetchError(`LLM proxy error ${error.status}`, error);
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
