import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LlmClient,
  LlmHttpError,
  toAnthropicRequest,
  fromAnthropicResponse,
} from "../services/llmClient.js";

// ---------------------------------------------------------------------------
// fetch stub — returns an Anthropic Messages response
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let lastRequest: { url: string; init: RequestInit } | null = null;

const ANTHROPIC_OK = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "sonnet",
  content: [{ type: "text", text: "ok" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 5, output_tokens: 2 },
};

beforeEach(() => {
  lastRequest = null;
  globalThis.fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      lastRequest = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify(ANTHROPIC_OK), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function getHeader(name: string): string | undefined {
  const headers = lastRequest?.init.headers as Record<string, string> | undefined;
  return headers?.[name];
}
function sentBody(): Record<string, unknown> {
  return JSON.parse(lastRequest!.init.body as string);
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

describe("LlmClient transport", () => {
  it("POSTs to /v1/messages (stripping a legacy /v1 base) with the version header", async () => {
    const client = new LlmClient({ baseUrl: "https://proxy.example/v1", apiKey: "secret" });
    await client.chatCompletion({ model: "sonnet", messages: [{ role: "user", content: "hi" }] });
    expect(lastRequest?.url).toBe("https://proxy.example/v1/messages");
    expect(getHeader("anthropic-version")).toBe("2023-06-01");
    expect(getHeader("x-api-key")).toBe("secret");
  });

  it("omits x-api-key entirely when no key is configured", async () => {
    const client = new LlmClient({ baseUrl: "https://proxy.example", apiKey: "" });
    await client.chatCompletion({ model: "sonnet", messages: [{ role: "user", content: "hi" }] });
    expect(lastRequest?.url).toBe("https://proxy.example/v1/messages");
    expect(getHeader("x-api-key")).toBeUndefined();
    expect(getHeader("Content-Type")).toBe("application/json");
  });

  it("translates the Anthropic response into the OpenAI-shaped result", async () => {
    const client = new LlmClient({ baseUrl: "https://proxy.example", apiKey: "" });
    const res = await client.chatCompletion({
      model: "sonnet",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.choices[0].message.content).toBe("ok");
    expect(res.choices[0].finish_reason).toBe("stop");
    expect(res.usage?.prompt_tokens).toBe(5);
    expect(res.usage?.completion_tokens).toBe(2);
    expect(res.model).toBe("sonnet");
  });

  it("throws LlmHttpError on non-2xx responses", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("upstream broke", { status: 502 }),
    ) as unknown as typeof fetch;
    const client = new LlmClient({ baseUrl: "https://proxy.example", apiKey: "" });
    await expect(
      client.chatCompletion({ model: "sonnet", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toBeInstanceOf(LlmHttpError);
  });

  it("sends max_tokens (required by Anthropic) — default when caller omits it", async () => {
    const client = new LlmClient({ baseUrl: "https://proxy.example", apiKey: "" });
    await client.chatCompletion({ model: "sonnet", messages: [{ role: "user", content: "hi" }] });
    expect(sentBody().max_tokens).toBe(8000);
  });
});

// ---------------------------------------------------------------------------
// Request translation (OpenAI-shaped → Anthropic)
// ---------------------------------------------------------------------------

describe("toAnthropicRequest", () => {
  it("hoists system messages to the top-level `system` field", () => {
    const out = toAnthropicRequest({
      model: "sonnet",
      messages: [
        { role: "system", content: "be terse" },
        { role: "user", content: "hi" },
      ],
    });
    expect(out.system).toBe("be terse");
    expect(out.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("converts OpenAI tools + 'required' tool_choice to Anthropic shape", () => {
    const out = toAnthropicRequest({
      model: "sonnet",
      tool_choice: "required",
      tools: [
        {
          type: "function",
          function: {
            name: "get_x",
            description: "d",
            parameters: { type: "object", properties: { a: {} }, required: ["a"] },
          },
        },
      ],
      messages: [{ role: "user", content: "hi" }],
    });
    expect(out.tool_choice).toEqual({ type: "any" });
    expect(out.tools).toEqual([
      {
        name: "get_x",
        description: "d",
        input_schema: { type: "object", properties: { a: {} }, required: ["a"] },
      },
    ]);
  });

  it("turns an assistant tool_call + tool result into tool_use / tool_result blocks", () => {
    const out = toAnthropicRequest({
      model: "sonnet",
      messages: [
        { role: "user", content: "weather?" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "t1", type: "function", function: { name: "get_x", arguments: '{"a":1}' } },
          ],
        },
        { role: "tool", content: "sunny", tool_call_id: "t1" },
        { role: "tool", content: "warm", tool_call_id: "t1b" },
      ],
    });
    expect(out.messages[1]).toEqual({
      role: "assistant",
      content: [{ type: "tool_use", id: "t1", name: "get_x", input: { a: 1 } }],
    });
    // Consecutive tool results merge into ONE user turn (Anthropic requires it).
    expect(out.messages[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", content: "sunny" },
        { type: "tool_result", tool_use_id: "t1b", content: "warm" },
      ],
    });
  });

  it("maps enable_thinking to the thinking block and drops temperature", () => {
    const out = toAnthropicRequest({
      model: "sonnet",
      temperature: 0.2,
      enable_thinking: true,
      thinking_budget: 2048,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(out.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });
    expect(out.temperature).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Response translation (Anthropic → OpenAI-shaped)
// ---------------------------------------------------------------------------

describe("fromAnthropicResponse", () => {
  it("maps a tool_use block to tool_calls with null content", () => {
    const res = fromAnthropicResponse({
      model: "sonnet",
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name: "get_x", input: { a: 1 } }],
      usage: { input_tokens: 10, output_tokens: 3 },
    });
    const msg = res.choices[0].message;
    expect(msg.content).toBeNull();
    expect(msg.tool_calls).toEqual([
      { id: "t1", type: "function", function: { name: "get_x", arguments: '{"a":1}' } },
    ]);
    expect(res.choices[0].finish_reason).toBe("tool_calls");
  });

  it("joins text blocks and surfaces thinking as reasoning_content", () => {
    const res = fromAnthropicResponse({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: "Hello " },
        { type: "text", text: "world" },
      ],
    });
    expect(res.choices[0].message.content).toBe("Hello world");
    expect(res.choices[0].message.reasoning_content).toBe("hmm");
  });
});
