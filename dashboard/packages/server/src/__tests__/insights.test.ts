import { describe, it, expect, vi } from "vitest";
import {
  GROUNDING_RULES,
  looksLikeHallucinatedToolCall,
  sanitizeAssistantContent,
} from "../services/groundingRules.js";
import { buildHealthTools } from "../services/healthTools.js";
import {
  runAgenticLoop,
  type AgenticLoopOptions,
} from "../services/agenticLoop.js";
import type {
  ChatCompletionResponse,
  LlmClient,
  ToolCall,
} from "../services/llmClient.js";

// ---------------------------------------------------------------------------
// Anti-fabrication helpers
// ---------------------------------------------------------------------------

describe("GROUNDING_RULES", () => {
  it("includes the 10 numbered rules verbatim", () => {
    // Check a few signature phrases that would silently disappear if
    // someone trims the rules without thinking. The exact wording is
    // load-bearing — the model behaviour changes when these go away.
    expect(GROUNDING_RULES).toMatch(/NEVER fabricate data/);
    expect(GROUNDING_RULES).toMatch(/NEVER invent tool calls as text/);
    expect(GROUNDING_RULES).toMatch(/NEVER fabricate tool responses/);
    expect(GROUNDING_RULES).toMatch(/VERIFY ALL MATH/);
    expect(GROUNDING_RULES).toMatch(/SHOW YOUR SOURCE/);
    // 10 numbered items — "10."" should appear at line start.
    expect(GROUNDING_RULES).toMatch(/^10\./m);
  });
});

describe("looksLikeHallucinatedToolCall", () => {
  it("flags JSON tool-call blobs in prose", () => {
    expect(
      looksLikeHallucinatedToolCall(
        'Calling tool: {"tool_calls": [{"name": "query_x"}]}',
      ),
    ).toBe(true);
  });
  it("flags <tool_response> tags", () => {
    expect(
      looksLikeHallucinatedToolCall(
        "Result <tool_response>{}</tool_response>",
      ),
    ).toBe(true);
  });
  it("flags name+arguments JSON", () => {
    expect(
      looksLikeHallucinatedToolCall(
        '{"name":"query_summary","arguments":{}}',
      ),
    ).toBe(true);
  });
  it("flags 'tool_response:' prose prefix", () => {
    expect(
      looksLikeHallucinatedToolCall("tool_response: { steps: 1000 }"),
    ).toBe(true);
  });
  it("does NOT flag clean prose", () => {
    expect(
      looksLikeHallucinatedToolCall(
        "Your steps last week averaged 8,400/day, up 6% (query_activity).",
      ),
    ).toBe(false);
  });
  it("does NOT flag honest empty-data acknowledgement", () => {
    expect(
      looksLikeHallucinatedToolCall(
        "I called query_weight and it returned no data for that window.",
      ),
    ).toBe(false);
  });
});

describe("sanitizeAssistantContent", () => {
  it("strips <tool_response> blocks", () => {
    const out = sanitizeAssistantContent(
      "before <tool_response>fake</tool_response> after",
    );
    expect(out).not.toMatch(/tool_response/);
  });
  it("strips fabricated name+arguments JSON inline", () => {
    const out = sanitizeAssistantContent(
      'leading text {"name":"query_x","arguments":{"foo":"bar"}} trailing',
    );
    expect(out).not.toMatch(/"arguments"/);
  });
  it("leaves clean text alone", () => {
    const text = "Your sleep averaged 6h45m last week (query_sleep).";
    expect(sanitizeAssistantContent(text)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Health tool registry
// ---------------------------------------------------------------------------

describe("buildHealthTools", () => {
  it("derives one tool per v1 endpoint", () => {
    const tools = buildHealthTools();
    expect(tools.length).toBeGreaterThan(10);
    // Every tool must have a query_-prefixed name and the same
    // description as the underlying endpoint.
    for (const t of tools) {
      expect(t.name).toMatch(/^query_/);
      expect(t.toolDef.function.description).toBe(t.endpoint.description);
    }
  });

  it("maps path '/supplements/adherence' → 'query_supplements_adherence'", () => {
    const tools = buildHealthTools();
    const adherence = tools.find((t) =>
      t.endpoint.path === "/supplements/adherence",
    );
    expect(adherence?.name).toBe("query_supplements_adherence");
  });

  it("propagates required-arg flags into the tool schema", () => {
    const tools = buildHealthTools();
    const corr = tools.find((t) =>
      t.endpoint.path === "/supplements/correlations",
    );
    expect(corr).toBeDefined();
    expect(corr!.toolDef.function.parameters.required).toContain("itemId");
  });
});

// ---------------------------------------------------------------------------
// Agentic loop
// ---------------------------------------------------------------------------

function fakeToolCall(id: string, name: string, args: object): ToolCall {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function makeLlm(
  responses: ChatCompletionResponse[],
): LlmClient {
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

function toolResponse(calls: ToolCall[]): ChatCompletionResponse {
  return {
    choices: [{ message: { content: null, tool_calls: calls } }],
  };
}

function baseOpts(
  overrides: Partial<AgenticLoopOptions> = {},
): AgenticLoopOptions {
  return {
    llm: makeLlm([textResponse("ok")]),
    model: "test-model",
    messages: [
      { role: "system", content: "test system" },
      { role: "user", content: "test user" },
    ],
    tools: [],
    executeTool: async () => "{}",
    task: "insights",
    ...overrides,
  };
}

describe("runAgenticLoop", () => {
  it("returns the model's final text when no tools are required", async () => {
    const result = await runAgenticLoop(
      baseOpts({
        llm: makeLlm([textResponse("Steps averaged 8,400/day.")]),
      }),
    );
    expect(result.content).toBe("Steps averaged 8,400/day.");
    expect(result.placeholder).toBe(false);
    expect(result.toolsCalled).toEqual([]);
  });

  it("executes tool calls and feeds their results back into the next round", async () => {
    const llm = makeLlm([
      toolResponse([fakeToolCall("c1", "query_summary", {})]),
      textResponse("Final answer based on tool data."),
    ]);
    const executeTool = vi.fn(async (name: string) =>
      JSON.stringify({ ok: name }),
    );
    const result = await runAgenticLoop(
      baseOpts({ llm, executeTool, requiredTools: ["query_summary"] }),
    );
    expect(executeTool).toHaveBeenCalledWith("query_summary", {});
    expect(result.toolsCalled).toEqual(["query_summary"]);
    expect(result.content).toBe("Final answer based on tool data.");
  });

  it("nags and retries when the model gives a final answer but required tools are missing", async () => {
    const llm = makeLlm([
      // Round 1: text response WITHOUT calling required tool — should be nagged.
      textResponse("Steps were great last week."),
      // Round 2: model complies and calls the tool.
      toolResponse([fakeToolCall("c1", "query_records", {})]),
      // Round 3: text answer using the tool result.
      textResponse("Based on query_records, your best step day was 18,984."),
    ]);
    const result = await runAgenticLoop(
      baseOpts({ llm, requiredTools: ["query_records"] }),
    );
    expect(result.toolsCalled).toEqual(["query_records"]);
    expect(result.content).toMatch(/18,984/);
    expect(result.placeholder).toBe(false);
  });

  it("emits a placeholder when the model refuses to call required tools after nags", async () => {
    const llm = makeLlm([
      textResponse("Faking an answer (round 1)."),
      textResponse("Faking an answer (round 2)."),
      textResponse("Faking an answer (round 3)."),
    ]);
    const result = await runAgenticLoop(
      baseOpts({ llm, requiredTools: ["query_records"], maxNags: 2 }),
    );
    expect(result.placeholder).toBe(true);
    expect(result.content).toMatch(/Unable to produce a grounded answer/);
    expect(result.content).toMatch(/query_records/);
  });

  it("retries when the model emits hallucinated tool-call JSON in prose", async () => {
    const llm = makeLlm([
      // Round 1: hallucinated tool-call JSON — should trigger correction
      textResponse('{"tool_calls": [{"name":"query_summary"}]}'),
      // Round 2: clean text — accepted
      textResponse("Sleep averaged 7h12m."),
    ]);
    const result = await runAgenticLoop(baseOpts({ llm }));
    expect(result.content).toBe("Sleep averaged 7h12m.");
  });

  it("aborts with a placeholder when the same tool signature repeats 3 times", async () => {
    const llm = makeLlm([
      toolResponse([fakeToolCall("c1", "query_summary", {})]),
      toolResponse([fakeToolCall("c2", "query_summary", {})]),
      toolResponse([fakeToolCall("c3", "query_summary", {})]),
    ]);
    const result = await runAgenticLoop(
      baseOpts({
        llm,
        // Required tool that's NEVER called — keeps the loop in
        // tool_choice=required mode forever.
        requiredTools: ["query_records"],
      }),
    );
    expect(result.placeholder).toBe(true);
    expect(result.content).toMatch(/query_records/);
  });

  it("passes tool_choice='required' while required tools are missing, then 'auto'", async () => {
    const calls: string[] = [];
    const llm = {
      chatCompletion: vi.fn(async (req: { tool_choice?: string }) => {
        calls.push(req.tool_choice ?? "(none)");
        if (calls.length === 1) {
          return toolResponse([
            fakeToolCall("c1", "query_records", {}),
          ]);
        }
        return textResponse("Done.");
      }),
    } as unknown as LlmClient;
    await runAgenticLoop(
      baseOpts({ llm, requiredTools: ["query_records"] }),
    );
    expect(calls[0]).toBe("required");
    expect(calls[1]).toBe("auto");
  });

  it("retries the chatCompletion call on transient 5xx via the LlmClient retry path", async () => {
    // Simulate a 500 the first time (proxy hiccup), success the second.
    // The agentic loop opts callers in to retries=2 by default, so the
    // round count remains 1 from the loop's perspective.
    const { LlmHttpError } = await import("../services/llmClient.js");
    let calls = 0;
    const llm = {
      chatCompletion: vi.fn(async () => {
        calls++;
        if (calls === 1) {
          throw new LlmHttpError(500, "Command failed");
        }
        return textResponse("Recovered.");
      }),
    } as unknown as LlmClient;
    // Wrap our fake llm with retry behaviour (mimicking the real one)
    const llmWithRetry = {
      chatCompletion: vi.fn(async (req, opts) => {
        const retries = opts?.retries ?? 0;
        let attempt = 0;
        while (true) {
          try {
            return await llm.chatCompletion(req, opts);
          } catch (err) {
            const transient =
              err instanceof LlmHttpError && err.status >= 500;
            if (transient && attempt < retries) {
              attempt++;
              continue;
            }
            throw err;
          }
        }
      }),
    } as unknown as LlmClient;
    const result = await runAgenticLoop(baseOpts({ llm: llmWithRetry }));
    expect(calls).toBe(2);
    expect(result.content).toBe("Recovered.");
  });

  it("emits progress events with the tool names called in each round", async () => {
    const llm = makeLlm([
      toolResponse([
        fakeToolCall("a", "query_summary", {}),
        fakeToolCall("b", "query_records", {}),
      ]),
      textResponse("Done."),
    ]);
    const events: string[] = [];
    await runAgenticLoop(
      baseOpts({
        llm,
        onProgress: (e) => events.push(e.kind),
      }),
    );
    expect(events).toContain("round-start");
    expect(events).toContain("tool-calls");
    expect(events).toContain("tool-result");
    expect(events).toContain("complete");
  });
});
