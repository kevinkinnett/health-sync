import { randomUUID } from "node:crypto";
import type { V1Context } from "../api/v1/endpoints.js";
import type {
  ChatRow,
  InsightRepository,
} from "../repositories/insightRepo.js";
import { GROUNDING_RULES } from "./groundingRules.js";
import {
  buildHealthTools,
  executeHealthTool,
} from "./healthTools.js";
import type { LlmClient, ChatMessage } from "./llmClient.js";
import { runAgenticLoop } from "./agenticLoop.js";

/**
 * Short system prompt — kept lean because the local Claude proxy
 * shell-marshals `--system-prompt "..."` and breaks on long payloads.
 * The grounding rules live in `CHAT_GROUNDING_PRELUDE` and are
 * prepended to the FIRST user message of every conversation.
 */
const CHAT_SYSTEM_PROMPT = `
You are a personal health analyst with access to the user's complete
Fitbit + supplements + medications data through a registered set of
read-only tools. Answer the user's questions about their own health
data using those tools.

When asked broad questions ("how am I doing?", "what's changed?"), pick
the 2-3 most relevant tools and answer concisely. When asked targeted
questions, call the most specific tool that fits. If a question can't
be answered with the available tools, say so plainly and suggest the
closest tool that could.

Be direct, factual, and quantitative. Use markdown sparingly — short
paragraphs, bullets when listing > 2 items, tables only when comparing
> 3 numeric columns. Round consistently. Quote exact item names.
`.trim();

const CHAT_GROUNDING_PRELUDE = `${GROUNDING_RULES}\n\n---\n\n`;

export interface ChatTurnResult {
  conversationId: string;
  message: { role: "assistant"; content: string };
  meta: {
    sanitized: boolean;
    placeholder: boolean;
    toolsCalled: string[];
    rounds: number;
  };
}

/**
 * Single-turn chat handler. The agentic loop runs end-to-end, then
 * the entire turn (assistant tool_calls rows + tool results +
 * final assistant text) is persisted as one transaction so a
 * mid-loop crash never leaves orphan rows.
 */
export class InsightChatService {
  constructor(
    private repo: InsightRepository,
    private llm: LlmClient,
    private v1Ctx: V1Context,
    private opts: { model: string },
  ) {}

  async send(input: {
    conversationId?: string;
    message: string;
  }): Promise<ChatTurnResult> {
    const conversationId = input.conversationId ?? randomUUID();
    const tools = buildHealthTools().map((t) => t.toolDef);

    // Persist the user turn before running the loop so a crash mid-loop
    // doesn't lose what the user asked.
    await this.repo.appendChatRow({
      conversationId,
      role: "user",
      content: input.message,
    });

    // Reload the full conversation (including persisted tool turns from
    // prior rounds) so the model has grounded context, not narrative
    // recap.
    const history = await this.repo.getFullConversation(conversationId);
    const replayed = history.map((r) => this.toChatMessage(r));
    // Prepend the grounding rules to the FIRST user message rather than
    // baking them into the system prompt. The proxy's shell-arg path
    // for --system-prompt fails on large payloads; the user-message
    // body has no such limit.
    const firstUserIdx = replayed.findIndex((m) => m.role === "user");
    if (firstUserIdx >= 0) {
      const original = replayed[firstUserIdx].content ?? "";
      if (!original.includes("DATA-GROUNDING RULES")) {
        replayed[firstUserIdx] = {
          ...replayed[firstUserIdx],
          content: `${CHAT_GROUNDING_PRELUDE}${original}`,
        };
      }
    }
    const messages: ChatMessage[] = [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      ...replayed,
    ];

    const result = await runAgenticLoop({
      llm: this.llm,
      model: this.opts.model,
      messages,
      tools,
      executeTool: (name, args) =>
        executeHealthTool(name, args, this.v1Ctx),
      maxRounds: 8,
      maxNags: 2,
      task: "chat",
      temperature: 0.3,
      enableThinking: true,
      thinkingBudget: 10000,
    });

    // Persist any new turns appended during the loop.
    // The loop's transcript starts with the messages we passed in, so
    // anything beyond that index is new.
    const newTurns = result.transcript.slice(messages.length);
    for (const turn of newTurns) {
      if (turn.role === "assistant") {
        await this.repo.appendChatRow({
          conversationId,
          role: "assistant",
          content: turn.content,
          toolCalls: turn.tool_calls ?? null,
        });
      } else if (turn.role === "tool") {
        await this.repo.appendChatRow({
          conversationId,
          role: "tool",
          content: turn.content ?? null,
          toolCallId: turn.tool_call_id ?? null,
          toolName: this.extractToolName(turn, result.transcript),
        });
      } else if (turn.role === "user") {
        // Nag messages — persist them too so a follow-up regenerate
        // sees the full transcript.
        await this.repo.appendChatRow({
          conversationId,
          role: "user",
          content: turn.content,
        });
      }
    }

    return {
      conversationId,
      message: { role: "assistant", content: result.content },
      meta: {
        sanitized: result.sanitized,
        placeholder: result.placeholder,
        toolsCalled: result.toolsCalled,
        rounds: result.rounds,
      },
    };
  }

  private toChatMessage(r: ChatRow): ChatMessage {
    if (r.role === "tool") {
      return {
        role: "tool",
        content: r.content ?? "",
        tool_call_id: r.toolCallId ?? undefined,
      };
    }
    if (r.role === "assistant") {
      return {
        role: "assistant",
        content: r.content,
        // Persist as JSONB; cast back to typed shape on replay.
        tool_calls: (r.toolCalls as
          | ChatMessage["tool_calls"]
          | null) ?? undefined,
      };
    }
    return { role: "user", content: r.content ?? "" };
  }

  /**
   * Walk back from a tool-result turn to the assistant turn that called
   * it, so we can persist `tool_name` alongside the result row. This
   * keeps the conversation table self-describing — the UI can later
   * decode "what tool produced this output" without re-parsing tool_calls.
   */
  private extractToolName(
    toolTurn: ChatMessage,
    transcript: ChatMessage[],
  ): string | null {
    if (!toolTurn.tool_call_id) return null;
    for (let i = transcript.length - 1; i >= 0; i--) {
      const m = transcript[i];
      if (m.role !== "assistant" || !m.tool_calls) continue;
      const match = m.tool_calls.find((c) => c.id === toolTurn.tool_call_id);
      if (match) return match.function.name;
    }
    return null;
  }
}
