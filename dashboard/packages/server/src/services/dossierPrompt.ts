import type { ChatMessage } from "./llmClient.js";
import type { DossierItemContext } from "./dossierItemReader.js";

// IMPORTANT: keep this short and pure ASCII.
//
// The proxy shells out to `claude -p --system-prompt <STR>`, and the long
// argv variant gets interpreted by the shell. All detailed instructions live
// in the first user message, which goes via stdin.
const SYSTEM_PROMPT =
  "You build structured reference dossiers using web research. Output exactly one fenced JSON code block matching the schema in the user message. Include nothing before or after the JSON block.";

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

export function buildDossierPrompt(
  context: DossierItemContext,
): ChatMessage[] {
  const { type, item } = context;
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
    if (item.ingredients.length > 0) {
      lines.push("");
      lines.push("Composition (per default dose):");
      for (const ingredient of item.ingredients) {
        lines.push(
          `  - ${ingredient.ingredientName}: ${ingredient.amount} ${ingredient.unit}`,
        );
      }
    }
  }

  lines.push("");
  lines.push(
    "Use the WebSearch and WebFetch tools available to you to gather authoritative information. Preferred sources: NIH ODS, DailyMed, Examine.com, Cochrane, Drugs.com, and the manufacturer's product page when the brand is known.",
  );
  lines.push("");
  lines.push(SCHEMA_DESCRIPTION);
  lines.push("");
  lines.push(
    "Citation rules: every section body must cite the sources it draws from as bracketed numbers like [1] or [2, 3], where the number matches a `sources[].id`. Cite at least 3 distinct sources across the dossier.",
  );
  lines.push(
    "Disclaimer rule: include a one-sentence non-medical-advice statement in the `disclaimer` field.",
  );
  lines.push("");
  lines.push(
    "Respond with ONLY a single fenced ```json code block. No prose before or after.",
  );

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

export function appendDossierRetryNudge(
  base: ChatMessage[],
  previousContent: string,
): ChatMessage[] {
  return [
    ...base,
    { role: "assistant", content: previousContent.slice(0, 4000) },
    {
      role: "user",
      content:
        "Your previous reply was not a valid JSON block matching the schema. Reply now with ONLY a single fenced ```json code block - no prose, no extra text, no explanation. The JSON must match the schema exactly.",
    },
  ];
}
