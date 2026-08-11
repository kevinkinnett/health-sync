import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LlmClient,
  LlmHttpError,
  LlmStreamError,
  toAnthropicRequest,
  fromAnthropicResponse,
} from "../services/llmClient.js";

// ---------------------------------------------------------------------------
// fetch stub — returns an Anthropic Messages SSE response
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let lastRequest: { url: string; init: RequestInit } | null = null;

const ANTHROPIC_OK_EVENTS = [
  {
    type: "message_start",
    message: {
      id: "msg_1",
      model: "sonnet",
      content: [],
      stop_reason: null,
      usage: { input_tokens: 5, output_tokens: 0 },
    },
  },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "ping" },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
  { type: "content_block_stop", index: 0 },
  {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 2 },
  },
  { type: "message_stop" },
];

function streamResponse(
  events: unknown[],
  options: { chunkSize?: number; lineEnding?: "\n" | "\r\n" } = {},
): Response {
  const newline = options.lineEnding ?? "\n";
  const payload = events
    .map((event) => {
      const type = (event as { type: string }).type;
      return `event: ${type}${newline}data: ${JSON.stringify(event)}${newline}${newline}`;
    })
    .join("");

  if (!options.chunkSize) {
    return new Response(payload, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const encoded = new TextEncoder().encode(payload);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < encoded.length; offset += options.chunkSize!) {
        controller.enqueue(encoded.slice(offset, offset + options.chunkSize!));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

beforeEach(() => {
  lastRequest = null;
  globalThis.fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      lastRequest = { url: String(url), init: init ?? {} };
      return streamResponse(ANTHROPIC_OK_EVENTS);
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
    expect(getHeader("Accept")).toBe("text/event-stream");
    expect(sentBody().stream).toBe(true);
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

  it("accumulates thinking, text, and chunked tool JSON across arbitrary byte boundaries", async () => {
    const events = [
      {
        type: "message_start",
        message: {
          id: "msg_tools",
          model: "sonnet",
          content: [],
          usage: { input_tokens: 7, output_tokens: 0 },
        },
      },
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "thinking", thinking: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "check data" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "signature_delta", signature: "signed" },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "tool_use", id: "tool_1", name: "query_sleep", input: {} },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: '{"days":' },
      },
      {
        type: "content_block_delta",
        index: 1,
        delta: { type: "input_json_delta", partial_json: "30}" },
      },
      { type: "content_block_stop", index: 1 },
      { type: "future_event", value: "ignored" },
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 9 },
      },
      { type: "message_stop" },
    ];
    globalThis.fetch = vi.fn(async () =>
      streamResponse(events, { chunkSize: 7, lineEnding: "\r\n" }),
    ) as unknown as typeof fetch;

    const client = new LlmClient({ baseUrl: "https://proxy.example", apiKey: "" });
    const result = await client.chatCompletion({
      model: "sonnet",
      messages: [{ role: "user", content: "How did I sleep?" }],
    });

    expect(result.choices[0].message.content).toBeNull();
    expect(result.choices[0].message.reasoning_content).toBe("check data");
    expect(result.choices[0].message.tool_calls).toEqual([
      {
        id: "tool_1",
        type: "function",
        function: { name: "query_sleep", arguments: '{"days":30}' },
      },
    ]);
    expect(result.choices[0].finish_reason).toBe("tool_calls");
    expect(result.usage).toMatchObject({
      prompt_tokens: 7,
      completion_tokens: 9,
      total_tokens: 16,
    });
  });

  it("surfaces mid-stream error events as typed errors", async () => {
    globalThis.fetch = vi.fn(async () =>
      streamResponse([
        ANTHROPIC_OK_EVENTS[0],
        {
          type: "error",
          error: { type: "overloaded_error", message: "busy" },
        },
      ]),
    ) as unknown as typeof fetch;
    const client = new LlmClient({ baseUrl: "https://proxy.example", apiKey: "" });

    await expect(
      client.chatCompletion({ model: "sonnet", messages: [] }),
    ).rejects.toMatchObject({
      name: "LlmStreamError",
      errorType: "overloaded_error",
      retryable: true,
    });
  });

  it("rejects a stream that ends before message_stop", async () => {
    globalThis.fetch = vi.fn(async () =>
      streamResponse(ANTHROPIC_OK_EVENTS.slice(0, -1)),
    ) as unknown as typeof fetch;
    const client = new LlmClient({ baseUrl: "https://proxy.example", apiKey: "" });

    await expect(
      client.chatCompletion({ model: "sonnet", messages: [] }),
    ).rejects.toBeInstanceOf(LlmStreamError);
  });

  it("aborts an upstream request when its call timeout expires", async () => {
    globalThis.fetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    ) as unknown as typeof fetch;
    const client = new LlmClient({ baseUrl: "https://proxy.example", apiKey: "" });

    await expect(
      client.chatCompletion(
        { model: "sonnet", messages: [] },
        { task: "chat", timeoutMs: 5 },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
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
