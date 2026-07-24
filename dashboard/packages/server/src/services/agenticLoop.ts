import {
  type ChatMessage,
  type ChatCompletionResponse,
  type ChatCompleter,
  type LlmTask,
  type ToolChoice,
  type ToolCall,
  type ToolDef,
  isSessionExpired,
} from "./llmClient.js";
import {
  looksLikeHallucinatedToolCall,
  sanitizeAssistantContent,
} from "./groundingRules.js";
import {
  Allowance,
  BudgetClock,
  RequiredTools,
  StuckDetector,
} from "./agentic/policies.js";
import { logger } from "../logger.js";

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
 *
 * The individual rules live in {@link ./agentic/policies.js} so each is
 * testable on its own; this function only sequences them.
 */

export interface AgenticLoopOptions {
  llm: ChatCompleter;
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
  /**
   * Per-call upstream timeout (ms). Defaults to 90s — long enough for
   * a healthy LLM completion to land, short enough that a stuck proxy
   * is felt within seconds rather than minutes. Each retry resets the
   * timeout, so total wall time is `(retries + 1) * timeoutMs` worst
   * case. Use `totalBudgetMs` to bound the whole loop.
   */
  callTimeoutMs?: number;
  /**
   * Total wall-time budget for the entire loop (across all rounds and
   * retries). When exceeded the loop emits a placeholder rather than
   * spinning forever. Defaults to 5 minutes.
   */
  totalBudgetMs?: number;
  /**
   * Optional logging label so server logs show e.g. "category=sleep"
   * alongside round/tools. Lets `pnpm logs | grep category=sleep`
   * trace one category through the loop.
   */
  label?: string;
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
  /** Total LLM rounds issued, across restarts. */
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
  const callTimeoutMs = opts.callTimeoutMs ?? 90_000;
  const label = opts.label ?? opts.task;

  const clock = new BudgetClock(opts.totalBudgetMs ?? 5 * 60_000);
  const tools = new RequiredTools(opts.requiredTools ?? []);
  const stuck = new StuckDetector(3);
  const nags = new Allowance(opts.maxNags ?? 2);
  // The proxy's tool session can expire mid-loop (restart / >10min idle);
  // allow one replay from the first user turn before giving up.
  const restarts = new Allowance(1);

  const transcript: ChatMessage[] = [...opts.messages];
  let placeholder = false;
  let finalContent = "";
  let sanitized = false;
  /** Total LLM rounds actually issued, across restarts. */
  let roundsRun = 0;
  /** True once a real final answer was accepted (may be empty text). */
  let answered = false;

  const bail = (missing: string[]): void => {
    placeholder = true;
    finalContent = placeholderMessage(missing);
  };

  for (let round = 1; round <= maxRounds; round++) {
    if (clock.expired()) {
      logger.warn(
        { label, round, elapsedMs: clock.elapsedMs, totalBudgetMs: clock.budget },
        "Agentic loop exceeded total wall-time budget; emitting placeholder",
      );
      bail(tools.missing());
      break;
    }

    const toolChoice: ToolChoice = tools.satisfied() ? "auto" : "required";
    const missingAtRoundStart = tools.missing();

    roundsRun++;
    opts.onProgress?.({ kind: "round-start", round, toolChoice });
    logger.info(
      {
        label,
        round,
        toolChoice,
        missing: missingAtRoundStart.length,
        called: tools.invokedCount,
      },
      "Agentic round start",
    );

    const roundStart = Date.now();
    let response: ChatCompletionResponse;
    try {
      response = await opts.llm.chatCompletion(
        {
          model: opts.model,
          messages: transcript,
          tools: opts.tools,
          tool_choice: toolChoice,
          temperature: opts.temperature ?? 0.3,
          enable_thinking: opts.enableThinking,
          thinking_budget: opts.thinkingBudget,
        },
        // Retry on transient 5xx — the local Claude proxy sometimes
        // returns 500 with subprocess errors that self-heal on retry.
        // Per-call timeout is tighter than the upstream default so a
        // hung subprocess doesn't pin the whole job for minutes.
        { task: opts.task, retries: 2, timeoutMs: callTimeoutMs },
      );
    } catch (err) {
      // Proxy tool session expired mid-loop — the stale tool_use_ids in
      // our transcript are dead, so retrying the same continuation just
      // 410s again. Replay from the first user turn: reset to the initial
      // messages and let the model regenerate tool calls with fresh ids.
      // Tools are idempotent reads, so re-running them is safe.
      if (isSessionExpired(err) && restarts.tryUse()) {
        logger.warn(
          { label, round, restarts: restarts.spent },
          "Proxy tool session expired; replaying loop from the first user turn",
        );
        transcript.length = 0;
        transcript.push(...opts.messages);
        tools.reset();
        stuck.reset();
        nags.reset();
        round = 0; // for-loop ++ brings it back to 1; the clock still caps wall time
        continue;
      }
      logger.warn(
        {
          label,
          round,
          durationMs: Date.now() - roundStart,
          err: (err as Error).message,
        },
        "Agentic round LLM call failed after retries; emitting placeholder",
      );
      bail(tools.missing());
      break;
    }

    const message = response.choices[0]?.message;
    const toolCalls = message?.tool_calls ?? [];
    logger.info(
      {
        label,
        round,
        durationMs: Date.now() - roundStart,
        toolCalls: toolCalls.length,
        contentChars: (message?.content ?? "").length,
      },
      "Agentic round complete",
    );

    if (toolCalls.length > 0) {
      // Persist the assistant turn that emitted these tool calls so
      // the next loop iteration carries it as context.
      transcript.push({
        role: "assistant",
        content: message?.content ?? null,
        tool_calls: toolCalls,
      });

      const toolNames = toolCalls.map((c) => c.function.name).sort();
      stuck.record(toolNames.join(","));
      opts.onProgress?.({ kind: "tool-calls", round, tools: toolNames });

      for (const call of toolCalls) {
        const result = await opts.executeTool(call.function.name, parseArgs(call));
        tools.markCalled(call.function.name);
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

      // Same tool signature `depth` rounds running AND requiredTools
      // still unsatisfied — the model is spinning, so stop early.
      if (missingAtRoundStart.length > 0 && stuck.isStuck()) {
        opts.onProgress?.({ kind: "stuck", round });
        bail(missingAtRoundStart);
        break;
      }

      // If that satisfied the last required tool, the next round runs
      // with tool_choice=auto and the model can answer.
      if (tools.satisfied()) continue;

      // Otherwise nag, naming the next missing tool explicitly. Keeps
      // the model from substituting "close enough" tools.
      const nowMissing = tools.missing();
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
      // Deliberately does NOT consume the nag allowance — a fabricated
      // tool call is a formatting failure, not a refusal to use tools.
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

    const missingNow = tools.missing();
    if (missingNow.length > 0) {
      // Final-text response while required tools are missing. The
      // grounding rules already say "don't fabricate" but some models
      // still do; an explicit retry catches the rest.
      if (!nags.tryUse()) {
        bail(missingNow);
        break;
      }
      transcript.push({ role: "assistant", content: text });
      transcript.push({
        role: "user",
        content:
          `That answer is incomplete: you have not yet called the required ` +
          `tools (${missingNow.join(", ")}). Do NOT fabricate values. ` +
          `Call ${missingNow[0]} now and base your answer on its result.`,
      });
      opts.onProgress?.({
        kind: "nag",
        round,
        reason: `text without ${missingNow.join(", ")}`,
      });
      continue;
    }

    // Accept the final answer. Sanitize as last-line-of-defense.
    const cleaned = sanitizeAssistantContent(text);
    sanitized = cleaned !== text;
    finalContent = cleaned;
    answered = true;
    transcript.push({ role: "assistant", content: cleaned });
    break;
  }

  // Fell out of the loop without accepting an answer or bailing — i.e.
  // the round cap was exhausted. Keyed off `answered` rather than an
  // empty `finalContent` so a legitimately empty final answer isn't
  // misreported as a placeholder.
  if (!answered && !placeholder) bail(tools.missing());

  opts.onProgress?.({ kind: "complete", rounds: roundsRun, sanitized });

  return {
    content: finalContent,
    transcript,
    toolsCalled: tools.invoked(),
    rounds: roundsRun,
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
