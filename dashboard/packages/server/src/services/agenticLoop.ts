import {
  type ChatMessage,
  type ChatCompletionResponse,
  type LlmClient,
  type LlmTask,
  type ToolChoice,
  type ToolCall,
  type ToolDef,
} from "./llmClient.js";
import {
  looksLikeHallucinatedToolCall,
  sanitizeAssistantContent,
} from "./groundingRules.js";

/**
 * Shared agentic tool-calling loop used by both Insights generation
 * (one loop per category) and the Chat surface (one loop per user
 * message). Patterns hard-won across the finance integration:
 *
 * - tool_choice: "required" while the caller has uncalled requiredTools
 *   pinned. Flip to "auto" once the required set is satisfied so the
 *   model can answer.
 * - Detect "stuck" loops via tool-call signature dedup over the last
 *   3 rounds. If the model keeps re-calling the same tools, abort
 *   with a placeholder rather than burn the round budget.
 * - Detect hallucinated tool calls in plain-text responses and push a
 *   corrective user message to retry. After `maxNags` corrections
 *   without a real tool call, give up with a placeholder.
 * - Persist the FULL transcript (assistant tool_calls rows + tool
 *   result rows + final assistant text) only after the loop succeeds
 *   so a mid-loop crash doesn't leave orphans. The caller decides
 *   what to persist and where.
 */

export interface AgenticLoopOptions {
  llm: LlmClient;
  model: string;
  /**
   * Caller-built initial messages. Should already include the system
   * prompt with GROUNDING_RULES and any prior conversation context.
   */
  messages: ChatMessage[];
  tools: ToolDef[];
  /** Tools that MUST be called before the loop accepts a final answer. */
  requiredTools?: string[];
  /** Tool dispatcher — return JSON-stringified result. */
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<string>;
  /** Hard ceiling on total LLM rounds. */
  maxRounds?: number;
  /**
   * After a final-text response without the required tools, retry up
   * to this many times with an explicit nag before giving up.
   */
  maxNags?: number;
  task: LlmTask;
  temperature?: number;
  enableThinking?: boolean;
  thinkingBudget?: number;
  /** Per-round progress callback for the UI. */
  onProgress?: (event: AgenticProgressEvent) => void;
}

export type AgenticProgressEvent =
  | { kind: "round-start"; round: number; toolChoice: ToolChoice }
  | { kind: "tool-calls"; round: number; tools: string[] }
  | { kind: "tool-result"; round: number; tool: string; bytes: number }
  | { kind: "nag"; round: number; reason: string }
  | { kind: "stuck"; round: number }
  | { kind: "complete"; rounds: number; sanitized: boolean };

export interface AgenticLoopResult {
  /** Final user-visible assistant text. */
  content: string;
  /**
   * Full transcript including the original messages plus all assistant
   * tool_calls turns and tool result turns. Caller persists what it
   * wants from this.
   */
  transcript: ChatMessage[];
  /** Tools that actually fired during the loop. */
  toolsCalled: string[];
  rounds: number;
  /** True if the sanitizer stripped suspect content from the final text. */
  sanitized: boolean;
  /** True if the loop bailed early (stuck/nag-exhausted/round-cap). */
  placeholder: boolean;
}

/**
 * Run the loop. Pure function: doesn't touch the database, doesn't
 * touch HTTP responses. The caller persists or returns whatever it
 * needs from `result.content` and `result.transcript`.
 */
export async function runAgenticLoop(
  opts: AgenticLoopOptions,
): Promise<AgenticLoopResult> {
  const maxRounds = opts.maxRounds ?? 10;
  const maxNags = opts.maxNags ?? 2;
  const required = new Set(opts.requiredTools ?? []);
  const called = new Set<string>();
  const transcript: ChatMessage[] = [...opts.messages];
  const lastSignatures: string[] = [];
  let nagsUsed = 0;
  let placeholder = false;
  let finalContent = "";
  let sanitized = false;

  for (let round = 1; round <= maxRounds; round++) {
    const stillMissing = [...required].filter((t) => !called.has(t));
    const toolChoice: ToolChoice = stillMissing.length > 0 ? "required" : "auto";

    opts.onProgress?.({ kind: "round-start", round, toolChoice });

    const response: ChatCompletionResponse = await opts.llm.chatCompletion(
      {
        model: opts.model,
        messages: transcript,
        tools: opts.tools,
        tool_choice: toolChoice,
        temperature: opts.temperature ?? 0.3,
        enable_thinking: opts.enableThinking,
        thinking_budget: opts.thinkingBudget,
      },
      // Retry once on transient 5xx — the local Claude proxy sometimes
      // returns 500 with subprocess errors that self-heal on retry.
      { task: opts.task, retries: 2 },
    );

    const choice = response.choices[0];
    const message = choice?.message;
    const toolCalls = message?.tool_calls ?? [];

    if (toolCalls.length > 0) {
      // Persist the assistant turn that emitted these tool calls so
      // the next loop iteration carries it as context.
      transcript.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: toolCalls,
      });

      const toolNames = toolCalls.map((c) => c.function.name).sort();
      const sig = toolNames.join(",");
      lastSignatures.push(sig);
      while (lastSignatures.length > 3) lastSignatures.shift();

      opts.onProgress?.({ kind: "tool-calls", round, tools: toolNames });

      for (const call of toolCalls) {
        const args = parseArgs(call);
        const result = await opts.executeTool(call.function.name, args);
        called.add(call.function.name);
        transcript.push({
          role: "tool",
          tool_call_id: call.id,
          content: result,
        });
        opts.onProgress?.({
          kind: "tool-result",
          round,
          tool: call.function.name,
          bytes: result.length,
        });
      }

      // Stuck detector: same tool signature 3 rounds in a row AND we
      // still haven't satisfied requiredTools — the model is spinning.
      if (
        stillMissing.length > 0 &&
        lastSignatures.length === 3 &&
        lastSignatures.every((s) => s === lastSignatures[0])
      ) {
        opts.onProgress?.({ kind: "stuck", round });
        placeholder = true;
        finalContent = placeholderMessage(stillMissing);
        break;
      }

      // If we just satisfied the last required tool, the next round
      // will run with tool_choice=auto and the model can answer.
      const nowMissing = [...required].filter((t) => !called.has(t));
      if (nowMissing.length === 0) continue;

      // Otherwise, push an explicit nag naming the next missing tool.
      // Keeps the model from substituting "close enough" tools.
      transcript.push({
        role: "user",
        content:
          `You still have not called: ${nowMissing[0]}. Call ${nowMissing[0]} ` +
          `next. Do not substitute it with another tool — the canonical ` +
          `aggregate tools are not interchangeable.`,
      });
      opts.onProgress?.({
        kind: "nag",
        round,
        reason: `missing ${nowMissing[0]}`,
      });
      continue;
    }

    // Plain-text response.
    const text = message?.content ?? "";

    if (looksLikeHallucinatedToolCall(text)) {
      transcript.push({ role: "assistant", content: text });
      transcript.push({
        role: "user",
        content:
          "Your last response contained tool-call syntax in the text body. " +
          "Tool invocations must go through the structured tool_calls field, " +
          "not prose. If you need data, call a tool. If you have enough data, " +
          "answer in plain markdown without tool-call JSON.",
      });
      opts.onProgress?.({
        kind: "nag",
        round,
        reason: "hallucinated tool call",
      });
      continue;
    }

    const stillMissingNow = [...required].filter((t) => !called.has(t));
    if (stillMissingNow.length > 0 && nagsUsed < maxNags) {
      // Final-text response while required tools missing — nag and
      // retry. The grounding rules already say "don't fabricate" but
      // some models still do; an explicit retry catches the rest.
      nagsUsed++;
      transcript.push({ role: "assistant", content: text });
      transcript.push({
        role: "user",
        content:
          `That answer is incomplete: you have not yet called the required ` +
          `tools (${stillMissingNow.join(", ")}). Do NOT fabricate values. ` +
          `Call ${stillMissingNow[0]} now and base your answer on its result.`,
      });
      opts.onProgress?.({
        kind: "nag",
        round,
        reason: `text without ${stillMissingNow.join(", ")}`,
      });
      continue;
    }

    if (stillMissingNow.length > 0) {
      // Nag budget exhausted — bail with a placeholder rather than
      // accept fabricated text.
      placeholder = true;
      finalContent = placeholderMessage(stillMissingNow);
      break;
    }

    // Accept the final answer. Sanitize as last-line-of-defense.
    const cleaned = sanitizeAssistantContent(text);
    sanitized = cleaned !== text;
    finalContent = cleaned;
    transcript.push({ role: "assistant", content: cleaned });
    break;
  }

  // If we hit the round cap without finishing, emit a placeholder
  // rather than return nothing.
  if (!finalContent) {
    placeholder = true;
    const stillMissingFinal = [...required].filter((t) => !called.has(t));
    finalContent = placeholderMessage(stillMissingFinal);
  }

  opts.onProgress?.({
    kind: "complete",
    rounds: lastSignatures.length || 1,
    sanitized,
  });

  return {
    content: finalContent,
    transcript,
    toolsCalled: [...called],
    rounds: lastSignatures.length || 1,
    sanitized,
    placeholder,
  };
}

function parseArgs(call: ToolCall): Record<string, unknown> {
  try {
    const parsed = JSON.parse(call.function.arguments);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function placeholderMessage(missing: string[]): string {
  const tail =
    missing.length > 0
      ? ` The model did not call the required tools (${missing.join(", ")}) ` +
        `and tried to fabricate the answer. Try regenerating, or refine the prompt.`
      : ` The model exhausted its round budget without producing a final answer.`;
  return `_Unable to produce a grounded answer for this section._${tail}`;
}
