import { describe, it, expect, beforeEach, vi } from "vitest";
import { InsightChatService } from "../services/insightChatService.js";
import type {
  ChatRecord,
  InsightRepository,
} from "../repositories/insightRepo.js";
import type {
  ChatCompletionResponse,
  LlmClient,
} from "../services/llmClient.js";

/**
 * Why this exists: `InsightChatService` is 200+ lines of subtle
 * ordering logic — user-message persisted BEFORE the loop runs,
 * grounding prelude injected ONLY into the first user message,
 * new turns persisted AFTER the loop completes, `tool_name`
 * resolved by walking back to the assistant turn that called it.
 * None of it was covered before audit Phase 5.1.
 *
 * Tests use an in-memory fake repo + a scripted fake LlmClient so
 * each ordering / replay invariant can be exercised in isolation.
 */

class FakeInsightRepo {
  rows: ChatRecord[] = [];

  reset() {
    this.rows = [];
  }

  async appendChatRecord(row: {
    conversationId: string;
    role: ChatRecord["role"];
    content: string | null;
    toolCalls?: unknown | null;
    toolCallId?: string | null;
    toolName?: string | null;
  }): Promise<void> {
    this.rows.push({
      id: this.rows.length + 1,
      conversationId: row.conversationId,
      role: row.role,
      content: row.content,
      toolCalls: row.toolCalls ?? null,
      toolCallId: row.toolCallId ?? null,
      toolName: row.toolName ?? null,
      createdAt: new Date(2026, 0, 1, 12, this.rows.length).toISOString(),
    });
  }

  async getFullConversation(conversationId: string): Promise<ChatRecord[]> {
    return this.rows.filter((r) => r.conversationId === conversationId);
  }
}

function makeLlm(responses: ChatCompletionResponse[]): LlmClient {
  let i = 0;
  return {
    chatCompletion: vi.fn(async () => {
      const r = responses[Math.min(i, responses.length - 1)];
      i++;
      return r;
    }),
  } as unknown as LlmClient;
}

function textResponse(content: string): ChatCompletionResponse {
  return { choices: [{ message: { content } }] };
}

function toolCallResponse(
  id: string,
  name: string,
  args: object = {},
): ChatCompletionResponse {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  };
}

const v1Ctx = {} as never;

function makeService(llm: LlmClient, repo: FakeInsightRepo): InsightChatService {
  return new InsightChatService(
    repo as unknown as InsightRepository,
    llm,
    v1Ctx,
    { model: "test-model" },
  );
}

describe("InsightChatService", () => {
  let repo: FakeInsightRepo;

  beforeEach(() => {
    repo = new FakeInsightRepo();
  });

  it("persists the user turn BEFORE running the loop (survives mid-loop crash)", async () => {
    // Simulate a loop crash by making the LLM throw.
    const llm = {
      chatCompletion: vi.fn(async () => {
        throw new Error("network is down");
      }),
    } as unknown as LlmClient;
    const service = makeService(llm, repo);

    // Loop will fail … but the user turn should still be in the DB.
    // (The agentic loop catches LLM throws and emits a placeholder
    // rather than re-raising, so `send` actually returns successfully
    // with placeholder=true. Either way the user row is persisted.)
    await service.send({ message: "How was my sleep?" }).catch(() => undefined);
    expect(repo.rows[0]?.role).toBe("user");
    expect(repo.rows[0]?.content).toBe("How was my sleep?");
  });

  it("injects the grounding prelude into the FIRST user message only", async () => {
    // Capture what's sent to the LLM on each round.
    const llm = makeLlm([textResponse("First answer."), textResponse("Second answer.")]);
    const captureSpy = vi.spyOn(llm, "chatCompletion");
    const service = makeService(llm, repo);

    // First turn.
    const r1 = await service.send({ message: "How was my sleep?" });
    const firstCall = captureSpy.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string | null }>;
    };
    const firstUserMessages = firstCall.messages.filter((m) => m.role === "user");
    expect(firstUserMessages[0].content).toMatch(/DATA-GROUNDING RULES/);

    // Second turn — same conversation.
    captureSpy.mockClear();
    await service.send({
      conversationId: r1.conversationId,
      message: "And steps?",
    });
    const secondCall = captureSpy.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string | null }>;
    };
    const userMsgsRound2 = secondCall.messages.filter((m) => m.role === "user");
    // First user message (replayed) still has the prelude; second one
    // (just sent) doesn't get it prepended again.
    expect(userMsgsRound2[0].content).toMatch(/DATA-GROUNDING RULES/);
    expect(userMsgsRound2[1].content).toBe("And steps?");
  });

  it("appends only the NEW turns from the loop transcript on completion", async () => {
    const llm = makeLlm([textResponse("Plain answer.")]);
    const service = makeService(llm, repo);
    await service.send({ message: "first" });

    // Repo now has exactly user + assistant (no tool turns since the
    // loop returned text immediately). The history-replay portion of
    // the loop must NOT cause the same user row to be appended twice.
    const userTurns = repo.rows.filter((r) => r.role === "user");
    expect(userTurns.length).toBe(1);
    const assistantTurns = repo.rows.filter((r) => r.role === "assistant");
    expect(assistantTurns.length).toBe(1);
    expect(assistantTurns[0].content).toBe("Plain answer.");
  });

  it("resolves tool_name by walking back to the assistant turn that issued the tool_call", async () => {
    // Round 1: assistant emits a tool_call. Round 2: text answer.
    const llm = makeLlm([
      toolCallResponse("call-1", "query_summary"),
      textResponse("Done."),
    ]);
    const service = makeService(llm, repo);

    // Stub the v1 dispatcher so the loop's executeTool returns something
    // benign without needing real V1Context. We do this via a module
    // mock — easiest for a single test.
    // The agentic loop calls executeHealthTool which uses buildHealthTools
    // and the v1 endpoint dispatcher. With v1Ctx as `{}`, the dispatcher
    // throws — but `executeHealthTool` catches and returns
    // `{ error: ... }` JSON so the loop survives. That's enough to
    // exercise the tool-name resolution path.
    await service.send({ message: "Summarise" });

    const toolRows = repo.rows.filter((r) => r.role === "tool");
    expect(toolRows.length).toBe(1);
    // The repository persisted `query_summary` as the tool_name — the
    // service walked back through the transcript to find the matching
    // assistant tool_call by id.
    expect(toolRows[0].toolName).toBe("query_summary");
  });

  it("reuses an existing conversationId for follow-ups (transcript replayed)", async () => {
    const llm = makeLlm([
      textResponse("First answer."),
      textResponse("Second answer."),
    ]);
    const captureSpy = vi.spyOn(llm, "chatCompletion");
    const service = makeService(llm, repo);

    const r1 = await service.send({ message: "Q1" });
    captureSpy.mockClear();
    const r2 = await service.send({
      conversationId: r1.conversationId,
      message: "Q2",
    });
    expect(r2.conversationId).toBe(r1.conversationId);

    // Second LLM call's message list must include both the original
    // question AND the prior assistant turn — so the model has the
    // full grounded context, not just a recap of Q1.
    const secondMessages = (captureSpy.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string | null }>;
    }).messages;
    const concatenated = secondMessages
      .map((m) => `${m.role}:${m.content ?? ""}`)
      .join("|");
    expect(concatenated).toContain("Q1");
    expect(concatenated).toContain("First answer.");
    expect(concatenated).toContain("Q2");
  });
});
