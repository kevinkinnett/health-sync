/**
 * Grounding rules injected into every LLM system prompt — the most
 * important anti-fabrication measure in the stack.
 *
 * Why a numbered checklist rather than a one-liner: empirically, smaller
 * and even mid-size models will often drop a single "don't fabricate"
 * line but respect a numbered list of explicit rules. The redundancy is
 * intentional. These are written specifically for the failure modes
 * we've observed:
 *
 * - Inventing dollar figures / step counts when a tool returned empty
 * - Emitting `{"tool_calls": [...]}` as prose instead of a structured
 *   tool-call (then "answering" against it as if the tool ran)
 * - Reusing numbers from earlier in the conversation without re-querying
 * - Quoting placeholder names instead of the actual account / supplement
 *   the user has
 * - Skipping the "I cannot answer" path and confidently making up an
 *   answer when the relevant tool isn't in the toolset
 *
 * Every callsite that sends a system prompt to a tool-calling model
 * should prepend GROUNDING_RULES.
 */
export const GROUNDING_RULES = `
DATA-GROUNDING RULES (read carefully — followed strictly):

1. NEVER fabricate data. Every number, date, name, dose, or trend you
   report MUST come from a tool result you actually received in this
   turn. Do not infer values from "general knowledge."

2. NEVER invent tool calls as text. Tool invocations go through
   structured tool_calls only — never write \`{"tool_calls": ...}\`,
   \`<tool_response>\`, \`{"name":"...","arguments":...}\`, or any other
   tool-call-like JSON inside your prose. If you need data, CALL the
   tool through the proper mechanism.

3. NEVER fabricate tool responses. Do not write "Tool returned: ..." or
   any synthetic <tool_response> block. If a tool result is missing,
   call the tool again or say so plainly.

4. VERIFY ALL MATH. Recompute any total, sum, average, or percentage
   from the cited line items. If you cannot show the work, do not
   present the figure.

5. NEVER reuse numbers from prior turns without re-querying. Health
   data updates daily — yesterday's tool result is stale today.

6. WHEN A TOOL RETURNS EMPTY OR NULL, say so plainly. Do not pad with
   "based on typical patterns" or invented context. Empty data is real
   data — report it.

7. IF THE USER ASKS FOR DATA YOU CANNOT GET (no matching tool, or the
   tool exists but returns nothing), say so. Do not guess. Suggest the
   closest available query instead.

8. NO PLACEHOLDER NAMES. Quote exact names (supplement, medication,
   activity type) from tool results. Don't write "Vitamin X" or
   "Activity Y" — call the tool, read the name, use it verbatim.

9. ROUND CONSISTENTLY. Pick a precision and stick with it across the
   whole answer (e.g. one decimal for kg, integer for steps, one
   decimal for percentage).

10. SHOW YOUR SOURCE for non-trivial figures by naming the tool you
    pulled them from in parentheses, e.g. "(query_records)" or
    "(query_supplement_correlations)".
`.trim();

// ---------------------------------------------------------------------------
// Hallucinated-tool-call detection
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate the model emitted tool-call syntax as prose
 * instead of via structured tool_calls. When any match, the loop
 * pushes a corrective user message and retries.
 *
 * Regexes kept loose on purpose — false positives are cheaper than
 * letting fabricated tool output through.
 */
const HALLUCINATED_TOOL_PATTERNS: RegExp[] = [
  /\{\s*"tool_calls"\s*:/i,
  /<\s*tool_response\s*>/i,
  /<\s*\/\s*tool_response\s*>/i,
  /\{\s*"name"\s*:\s*"[a-z_]+"\s*,\s*"arguments"\s*:/i,
  /^\s*tool[_ ]response\s*:/im,
];

export function looksLikeHallucinatedToolCall(content: string): boolean {
  return HALLUCINATED_TOOL_PATTERNS.some((re) => re.test(content));
}

/**
 * Last-line-of-defense: even when the agentic loop succeeds, the model
 * may sneak fragments of tool-call syntax into its prose. Strip the
 * obvious offenders before showing to the user.
 *
 * Conservative: only strips patterns that are certain artifacts. Safe
 * markdown content (code blocks, JSON examples in fenced blocks the
 * user explicitly asked for) is left alone.
 */
export function sanitizeAssistantContent(content: string): string {
  return content
    .replace(/<tool_response>[\s\S]*?<\/tool_response>/gi, "")
    .replace(/^\s*\{\s*"tool_calls"[\s\S]*?\n\}\s*$/gim, "")
    .replace(
      /\{\s*"name"\s*:\s*"[a-z_]+"\s*,\s*"arguments"\s*:[\s\S]*?\}\s*\}/gi,
      "",
    )
    .trim();
}
