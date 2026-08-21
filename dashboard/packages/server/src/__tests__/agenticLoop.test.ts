import { describe, it, expect } from "vitest";
import { runAgenticLoop } from "../services/agenticLoop.js";
import {
  LlmHttpError,
  toAnthropicRequest,
  type ChatCompletionResponse,
  type ChatCompleter,
  type ToolDef,
} from "../services/llmClient.js";

function textResponse(content: string): ChatCompletionResponse {
  return { choices: [{ message: { content }, finish_reason: "stop" }] };
}

function toolCallResponse(name: string, id: string): ChatCompletionResponse {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            { id, type: "function", function: { name, arguments: "{}" } },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  };
}

const TOOL: ToolDef = {
  type: "function",
  function: {
    name: "query_x",
    description: "d",
    parameters: { type: "object", properties: {} },
  },
};

const SESSION_EXPIRED = () =>
  new LlmHttpError(410, JSON.stringify({ error: { type: "session_expired" } }));

/** Test doubles satisfy the narrow ChatCompleter port — no casts needed. */
function scripted(fn: () => Promise<ChatCompletionResponse>): ChatCompleter {
  return { chatCompletion: fn };
}

describe("runAgenticLoop — proxy session-expiry recovery", () => {
  it("replays from the first user turn on 410 session_expired, then completes", async () => {
    let calls = 0;
    const llm = scripted(async () => {
      calls++;
      if (calls === 1) throw SESSION_EXPIRED();
      return textResponse("grounded answer");
    });

    const result = await runAgenticLoop({
      llm,
      model: "sonnet",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "ask" },
      ],
      tools: [],
      executeTool: async () => "{}",
      task: "chat",
    });

    expect(calls).toBe(2); // first 410 → restart → second succeeds
    expect(result.content).toBe("grounded answer");
    expect(result.placeholder).toBe(false);
    expect(result.exitReason).toBe("answered");
  });

  it("gives up with a placeholder when the session expires again after the one allowed restart", async () => {
    let calls = 0;
    const llm = scripted(async () => {
      calls++;
      throw SESSION_EXPIRED();
    });

    const result = await runAgenticLoop({
      llm,
      model: "sonnet",
      messages: [{ role: "user", content: "ask" }],
      tools: [],
      executeTool: async () => "{}",
      task: "insights",
      requiredTools: ["query_x"],
    });

    expect(calls).toBe(2); // initial attempt + one restart, both 410
    expect(result.placeholder).toBe(true);
    expect(result.exitReason).toBe("session-expired");
    expect(result.content).toMatch(/session expired/i);
  });

  it("does not restart on an ordinary 500 (that path emits a placeholder)", async () => {
    let calls = 0;
    const llm = scripted(async () => {
      calls++;
      throw new LlmHttpError(500, "boom");
    });

    const result = await runAgenticLoop({
      llm,
      model: "sonnet",
      messages: [{ role: "user", content: "ask" }],
      tools: [],
      executeTool: async () => "{}",
      task: "chat",
    });

    expect(calls).toBe(1); // no replay for non-session-expiry errors
    expect(result.placeholder).toBe(true);
    expect(result.exitReason).toBe("llm-error");
    expect(result.content).toMatch(/AI service could not complete/i);
  });

  it("reports an expired proxy login as an authentication failure", async () => {
    const llm = scripted(async () => {
      throw new LlmHttpError(
        500,
        '{"error":{"message":"Not logged in · Please run /login"}}',
      );
    });

    const result = await runAgenticLoop({
      llm,
      model: "sonnet",
      messages: [{ role: "user", content: "ask" }],
      tools: [],
      executeTool: async () => "{}",
      task: "chat",
    });

    expect(result.placeholder).toBe(true);
    expect(result.exitReason).toBe("auth-required");
    expect(result.content).toMatch(/login has expired/i);
  });
});

describe("runAgenticLoop — reported round count", () => {
  it("counts every LLM round, not the 3-entry stuck-detection window", async () => {
    // 5 tool rounds then a final answer. The stuck detector's signature
    // window caps at 3, so deriving `rounds` from it under-reports any
    // loop longer than 3 rounds (the Insights job UI reads this).
    let calls = 0;
    const llm = scripted(async () => {
      calls++;
      // Vary the tool-call id so the stuck detector doesn't trip.
      return calls <= 5
        ? toolCallResponse("query_x", `call_${calls}`)
        : textResponse("done");
    });

    const result = await runAgenticLoop({
      llm,
      model: "sonnet",
      messages: [{ role: "user", content: "ask" }],
      tools: [TOOL],
      executeTool: async () => "{}",
      task: "insights",
    });

    expect(calls).toBe(6);
    expect(result.rounds).toBe(6);
    expect(result.placeholder).toBe(false);
  });

  it("reports 1 round for a single-shot answer", async () => {
    const result = await runAgenticLoop({
      llm: scripted(async () => textResponse("hi")),
      model: "sonnet",
      messages: [{ role: "user", content: "ask" }],
      tools: [],
      executeTool: async () => "{}",
      task: "chat",
    });
    expect(result.rounds).toBe(1);
  });
});

describe("runAgenticLoop — tool budget and reserved synthesis", () => {
  it("allows 12 tool executions, then forces a no-tools synthesis round", async () => {
    const choices: Array<string | undefined> = [];
    let calls = 0;
    let executions = 0;
    const llm = scripted(async () => {
      calls++;
      return calls <= 12
        ? toolCallResponse("query_x", `call_${calls}`)
        : textResponse("synthesized answer");
    });
    const original = llm.chatCompletion.bind(llm);
    llm.chatCompletion = async (request, options) => {
      choices.push(request.tool_choice);
      return original(request, options);
    };

    const result = await runAgenticLoop({
      llm,
      model: "sonnet",
      messages: [{ role: "user", content: "ask" }],
      tools: [TOOL],
      executeTool: async () => {
        executions++;
        return "{}";
      },
      maxToolCalls: 12,
      maxRounds: 13,
      task: "chat",
    });

    expect(calls).toBe(13);
    expect(executions).toBe(12);
    expect(choices.slice(0, 12)).toEqual(Array(12).fill("auto"));
    expect(choices[12]).toBe("none");
    expect(result.content).toBe("synthesized answer");
    expect(result.placeholder).toBe(false);
    expect(result.rounds).toBe(13);
  });

  it("keeps the fallback assistant turn in the transcript at the round cap", async () => {
    const result = await runAgenticLoop({
      llm: scripted(async () => toolCallResponse("query_x", "call_1")),
      model: "sonnet",
      messages: [{ role: "user", content: "ask" }],
      tools: [TOOL],
      executeTool: async () => "{}",
      maxRounds: 1,
      task: "chat",
    });

    expect(result.placeholder).toBe(true);
    expect(result.exitReason).toBe("round-limit");
    expect(result.transcript.at(-1)).toEqual({
      role: "assistant",
      content: result.content,
    });
    expect(result.content).toMatch(/round budget/i);
  });

  it("returns protocol-complete synthetic results for calls beyond the budget", async () => {
    let round = 0;
    let executions = 0;
    const llm = scripted(async () => {
      round++;
      if (round === 2) return textResponse("done");
      return {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "first",
                  type: "function",
                  function: { name: "query_x", arguments: "{}" },
                },
                {
                  id: "overflow",
                  type: "function",
                  function: { name: "query_x", arguments: "{}" },
                },
              ],
            },
          },
        ],
      };
    });

    const result = await runAgenticLoop({
      llm,
      model: "sonnet",
      messages: [{ role: "user", content: "ask" }],
      tools: [TOOL],
      executeTool: async () => {
        executions++;
        return "{}";
      },
      maxToolCalls: 1,
      maxRounds: 2,
      task: "chat",
    });

    expect(executions).toBe(1);
    expect(result.content).toBe("done");
    const overflow = result.transcript.find(
      (message) => message.role === "tool" && message.tool_call_id === "overflow",
    );
    expect(overflow?.content).toMatch(/tool_budget_exhausted/);
  });
});

describe("runAgenticLoop — empty final answer", () => {
  it("treats an empty-but-valid answer as answered, not as a placeholder", async () => {
    const result = await runAgenticLoop({
      llm: scripted(async () => textResponse("")),
      model: "sonnet",
      messages: [{ role: "user", content: "ask" }],
      tools: [],
      executeTool: async () => "{}",
      task: "chat",
    });

    expect(result.content).toBe("");
    expect(result.placeholder).toBe(false);
  });
});

describe("toAnthropicRequest — tool_choice guard", () => {
  it("drops tool_choice when no tools are attached (Anthropic 400s otherwise)", () => {
    const out = toAnthropicRequest({
      model: "sonnet",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      tool_choice: "required",
    });
    expect(out.tool_choice).toBeUndefined();
    expect(out.tools).toBeUndefined();
  });

  it("still maps tool_choice when tools ARE attached", () => {
    const out = toAnthropicRequest({
      model: "sonnet",
      messages: [{ role: "user", content: "hi" }],
      tools: [TOOL],
      tool_choice: "required",
    });
    expect(out.tool_choice).toEqual({ type: "any" });
  });
});
