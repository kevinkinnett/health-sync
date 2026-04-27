import { z } from "zod";
import type {
  DossierContent,
  DossierEntry,
  DossierItemType,
  DossierSection,
  DossierSectionKey,
  MedicationItem,
  SupplementItem,
} from "@health-dashboard/shared";
import { logger } from "../logger.js";
import type { DossierRepository } from "../repositories/dossierRepo.js";
import {
  SupplementService,
  NotFoundError as SupplementNotFoundError,
} from "./supplementService.js";
import {
  MedicationService,
  NotFoundError as MedicationNotFoundError,
} from "./medicationService.js";
import type { ChatMessage, LlmClient } from "./llmClient.js";
import { LlmHttpError } from "./llmClient.js";

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

/**
 * Thrown when the LLM call returns something we can't turn into a valid
 * DossierContent — bad/missing JSON, schema mismatch, HTTP failure.
 * The controller surfaces this as 502 (we did not get a usable upstream).
 */
export class DossierFetchError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DossierFetchError";
  }
}

/** Re-export so the controller can map both kinds to 404. */
export class DossierNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DossierNotFoundError";
  }
}

// ----------------------------------------------------------------------------
// Schema (zod) for what we expect the LLM to return
// ----------------------------------------------------------------------------

const SECTION_KEYS: readonly DossierSectionKey[] = [
  "summary",
  "activeIngredients",
  "mechanism",
  "indications",
  "dosing",
  "sideEffects",
  "interactions",
  "brandNotes",
  "quality",
];

const sourceSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string().optional(),
});

const sectionSchema = z.object({
  key: z.enum(SECTION_KEYS as unknown as [DossierSectionKey, ...DossierSectionKey[]]),
  heading: z.string().min(1),
  body: z.string().min(1),
  sourceIds: z.array(z.number().int().positive()),
});

const contentSchema = z.object({
  version: z.literal(1),
  headline: z.string().min(1),
  disclaimer: z.string().min(1),
  sections: z.array(sectionSchema).min(1),
  sources: z.array(sourceSchema),
});

// ----------------------------------------------------------------------------
// Service
// ----------------------------------------------------------------------------

export interface DossierServiceOptions {
  /** Model to request from the proxy (Qwen alias the proxy understands). */
  model: string;
  /** Override for tests so we don't actually wait between retries. */
  retryDelayMs?: number;
}

export class DossierService {
  constructor(
    private readonly repo: DossierRepository,
    private readonly supplements: SupplementService,
    private readonly medications: MedicationService,
    private readonly llm: LlmClient,
    private readonly opts: DossierServiceOptions,
  ) {}

  get(
    type: DossierItemType,
    id: number,
  ): Promise<DossierEntry | null> {
    return this.repo.get(type, id);
  }

  async delete(type: DossierItemType, id: number): Promise<void> {
    await this.repo.delete(type, id);
  }

  /**
   * Look up the item, ask the LLM for a dossier, validate, persist, return.
   * One retry on parse/validation failure; HTTP failures are not retried
   * (the proxy already retries internally).
   */
  async refresh(
    type: DossierItemType,
    id: number,
  ): Promise<DossierEntry> {
    const item = await this.loadItem(type, id);
    const baseMessages = buildPrompt(type, item);

    const start = Date.now();
    let lastErr: unknown;
    let messages: ChatMessage[] = baseMessages;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.llm.chatCompletion({
          model: this.opts.model,
          messages,
          temperature: 0.1,
          max_tokens: 8000,
        });

        const content = response.choices[0]?.message?.content;
        if (typeof content !== "string" || content.length === 0) {
          throw new DossierFetchError(
            "LLM proxy returned an empty assistant message",
          );
        }

        const rawJson = extractJsonBlock(content);
        if (rawJson == null) {
          await this.repo.recordUsage({
            itemType: type,
            itemId: id,
            requestedModel: this.opts.model,
            actualModel: response.model ?? null,
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            reasoningTokens:
              response.usage?.completion_tokens_details?.reasoning_tokens,
            durationMs: Date.now() - start,
            status: "parse_error",
          });
          messages = appendStrictRetryNudge(baseMessages, content);
          lastErr = new DossierFetchError(
            "Could not find a JSON block in the LLM response",
          );
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawJson);
        } catch (err) {
          await this.repo.recordUsage({
            itemType: type,
            itemId: id,
            requestedModel: this.opts.model,
            actualModel: response.model ?? null,
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            reasoningTokens:
              response.usage?.completion_tokens_details?.reasoning_tokens,
            durationMs: Date.now() - start,
            status: "parse_error",
          });
          messages = appendStrictRetryNudge(baseMessages, content);
          lastErr = new DossierFetchError("LLM JSON failed to parse", err);
          continue;
        }

        const validated = contentSchema.safeParse(parsed);
        if (!validated.success) {
          await this.repo.recordUsage({
            itemType: type,
            itemId: id,
            requestedModel: this.opts.model,
            actualModel: response.model ?? null,
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
            reasoningTokens:
              response.usage?.completion_tokens_details?.reasoning_tokens,
            durationMs: Date.now() - start,
            status: "validation_error",
          });
          messages = appendStrictRetryNudge(baseMessages, content);
          lastErr = new DossierFetchError(
            `LLM JSON did not match schema: ${validated.error.message}`,
          );
          continue;
        }

        const content_: DossierContent = sortSections(
          validated.data as DossierContent,
        );

        const entry = await this.repo.upsert({
          itemType: type,
          itemId: id,
          itemName: item.name,
          itemBrand: item.brand ?? null,
          itemForm: item.form ?? null,
          content: content_,
          model: response.model ?? this.opts.model,
          inputTokens: response.usage?.prompt_tokens ?? null,
          outputTokens: response.usage?.completion_tokens ?? null,
        });

        await this.repo.recordUsage({
          itemType: type,
          itemId: id,
          requestedModel: this.opts.model,
          actualModel: response.model ?? null,
          promptTokens: response.usage?.prompt_tokens,
          completionTokens: response.usage?.completion_tokens,
          reasoningTokens:
            response.usage?.completion_tokens_details?.reasoning_tokens,
          durationMs: Date.now() - start,
          status: "ok",
        });
        return entry;
      } catch (err) {
        if (err instanceof LlmHttpError) {
          await this.repo.recordUsage({
            itemType: type,
            itemId: id,
            requestedModel: this.opts.model,
            durationMs: Date.now() - start,
            status: "http_error",
          });
          throw new DossierFetchError(
            `LLM proxy error ${err.status}`,
            err,
          );
        }
        if (err instanceof DossierFetchError) {
          // Already accounted for above; loop continues for retry.
          lastErr = err;
          continue;
        }
        throw err;
      }
    }

    logger.warn(
      { type, id, lastErr: String(lastErr) },
      "Dossier refresh failed after retry",
    );
    throw lastErr instanceof DossierFetchError
      ? lastErr
      : new DossierFetchError("Dossier refresh failed");
  }

  // --------------------------------------------------------------------------
  // helpers
  // --------------------------------------------------------------------------

  private async loadItem(
    type: DossierItemType,
    id: number,
  ): Promise<SupplementItem | MedicationItem> {
    try {
      if (type === "supplement") {
        return await this.supplements.getItem(id);
      }
      return await this.medications.getItem(id);
    } catch (err) {
      if (
        err instanceof SupplementNotFoundError ||
        err instanceof MedicationNotFoundError
      ) {
        throw new DossierNotFoundError(
          `${type === "supplement" ? "Supplement" : "Medication"} ${id} not found`,
        );
      }
      throw err;
    }
  }
}

// ----------------------------------------------------------------------------
// Prompt construction
// ----------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  "You are building a reference dossier for a personal health tracker.",
  "Use whatever web tools (WebSearch, WebFetch) you have available to gather authoritative information from sources like NIH ODS, DailyMed, Examine.com, Cochrane, Drugs.com, and the manufacturer's product page.",
  "Reply with a SINGLE fenced ```json code block matching the schema in the user message — no preamble, no explanation outside the block.",
  "Every section's body should reference the relevant sources by number, e.g. \"Vitamin D supports calcium absorption [1].\".",
  "Always include a one-sentence non-medical-advice disclaimer in the `disclaimer` field.",
].join(" ");

const SCHEMA_DESCRIPTION = `JSON schema (TypeScript):
{
  "version": 1,
  "headline": string,         // one-line summary
  "disclaimer": string,       // brief non-medical-advice statement
  "sections": Array<{
    "key": "summary" | "activeIngredients" | "mechanism" | "indications"
         | "dosing" | "sideEffects" | "interactions" | "brandNotes" | "quality",
    "heading": string,
    "body": string,            // newline-separated paragraphs; cite sources as [1], [2] etc.
    "sourceIds": number[]      // ids from the sources array used in this section
  }>,
  "sources": Array<{
    "id": number,              // 1-based, unique within this dossier
    "title": string,
    "url": string,              // valid http(s) URL
    "publisher"?: string        // e.g. "NIH ODS", "DailyMed", brand name
  }>
}

Include at minimum the sections: summary, activeIngredients, mechanism, dosing, sideEffects, interactions. Add brandNotes and quality if the brand is known and notable info exists. Skip indications if it duplicates summary.`;

function buildPrompt(
  type: DossierItemType,
  item: SupplementItem | MedicationItem,
): ChatMessage[] {
  const lines: string[] = [];
  lines.push(
    `Build a dossier for the following ${type === "supplement" ? "dietary supplement" : "medication"}:`,
  );
  lines.push("");
  lines.push(`- Name: ${item.name}`);
  if (item.brand) lines.push(`- Brand: ${item.brand}`);
  if (item.form) lines.push(`- Form: ${item.form}`);
  if (item.defaultAmount != null) {
    lines.push(`- Default dose: ${item.defaultAmount} ${item.defaultUnit}`);
  }
  if (item.notes) lines.push(`- User notes: ${item.notes}`);

  if (type === "supplement") {
    const supp = item as SupplementItem;
    if (supp.ingredients.length > 0) {
      lines.push("");
      lines.push("Composition (per default dose):");
      for (const ing of supp.ingredients) {
        lines.push(`  - ${ing.ingredientName}: ${ing.amount} ${ing.unit}`);
      }
    }
  }

  lines.push("");
  lines.push(SCHEMA_DESCRIPTION);
  lines.push("");
  lines.push(
    "Respond with ONLY the fenced ```json block. Cite at least 3 distinct sources.",
  );

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

function appendStrictRetryNudge(
  base: ChatMessage[],
  previousContent: string,
): ChatMessage[] {
  return [
    ...base,
    { role: "assistant", content: previousContent.slice(0, 4000) },
    {
      role: "user",
      content:
        "Your previous reply was not a valid JSON block matching the schema. Reply now with ONLY a single fenced ```json code block — no prose, no extra text, no explanation. The JSON must match the schema exactly.",
    },
  ];
}

// ----------------------------------------------------------------------------
// JSON extraction
// ----------------------------------------------------------------------------

const FENCED_JSON_RE = /```(?:json)?\s*\n([\s\S]*?)\n```/i;
// Patterns the proxy skill calls out as "model fabricated tool output".
const HALLUCINATION_RE_LIST: RegExp[] = [
  /<\s*tool_response\s*>[\s\S]*?<\s*\/\s*tool_response\s*>/gi,
  /\{\s*"name"\s*:\s*"[a-z_]+"\s*,\s*"arguments"\s*:[\s\S]*?\}\s*\}/gi,
];

/**
 * Strip leaked tool-call text and pull out a JSON block.
 * Falls back to "first { … last }" if no fenced block is present.
 *
 * Exported for unit testing.
 */
export function extractJsonBlock(content: string): string | null {
  let cleaned = content;
  for (const re of HALLUCINATION_RE_LIST) {
    cleaned = cleaned.replace(re, "");
  }
  const fenced = cleaned.match(FENCED_JSON_RE);
  if (fenced) return fenced[1].trim();

  // Fallback: first { to last } that round-trips through JSON.parse.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Sort sections by the canonical key order so the UI doesn't need to.
 * Unknown keys would have failed validation, so this is total.
 *
 * Exported for unit testing.
 */
export function sortSections(content: DossierContent): DossierContent {
  const order = new Map<DossierSectionKey, number>(
    SECTION_KEYS.map((k, i) => [k, i] as const),
  );
  const sorted: DossierSection[] = [...content.sections].sort(
    (a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99),
  );
  return { ...content, sections: sorted };
}
