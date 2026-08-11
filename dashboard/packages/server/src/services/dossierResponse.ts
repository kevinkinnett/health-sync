import { z } from "zod";
import type {
  DossierContent,
  DossierSection,
  DossierSectionKey,
} from "@health-dashboard/shared";

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

export type DossierResponseFailureStatus =
  | "parse_error"
  | "validation_error";

export class DossierResponseError extends Error {
  constructor(
    message: string,
    public readonly status: DossierResponseFailureStatus,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DossierResponseError";
  }
}

/** Decode and normalize an assistant reply into trusted dossier content. */
export function decodeDossierResponse(content: unknown): DossierContent {
  if (typeof content !== "string" || content.length === 0) {
    throw new DossierResponseError(
      "LLM proxy returned an empty assistant message",
      "parse_error",
    );
  }

  const rawJson = extractJsonBlock(content);
  if (rawJson == null) {
    throw new DossierResponseError(
      "Could not find a JSON block in the LLM response",
      "parse_error",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new DossierResponseError(
      "LLM JSON failed to parse",
      "parse_error",
      error,
    );
  }

  const validated = contentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new DossierResponseError(
      `LLM JSON did not match schema: ${validated.error.message}`,
      "validation_error",
      validated.error,
    );
  }

  return sortDossierSections(validated.data as DossierContent);
}

const FENCED_JSON_RE = /```(?:json)?\s*\n([\s\S]*?)\n```/i;
const HALLUCINATION_RE_LIST: RegExp[] = [
  /<\s*tool_response\s*>[\s\S]*?<\s*\/\s*tool_response\s*>/gi,
  /\{\s*"name"\s*:\s*"[a-z_]+"\s*,\s*"arguments"\s*:[\s\S]*?\}\s*\}/gi,
];

/** Strip leaked tool-call text and return the assistant's JSON payload. */
export function extractJsonBlock(content: string): string | null {
  let cleaned = content;
  for (const pattern of HALLUCINATION_RE_LIST) {
    cleaned = cleaned.replace(pattern, "");
  }

  const fenced = cleaned.match(FENCED_JSON_RE);
  if (fenced) return fenced[1].trim();

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

/** Keep presentation order out of the UI and stable across model responses. */
export function sortDossierSections(content: DossierContent): DossierContent {
  const order = new Map<DossierSectionKey, number>(
    SECTION_KEYS.map((key, index) => [key, index] as const),
  );
  const sections: DossierSection[] = [...content.sections].sort(
    (left, right) =>
      (order.get(left.key) ?? 99) - (order.get(right.key) ?? 99),
  );
  return { ...content, sections };
}
