import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LlmClient, LlmHttpError } from "../services/llmClient.js";

// ---------------------------------------------------------------------------
// fetch stub
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
let lastRequest: { url: string; init: RequestInit } | null = null;

beforeEach(() => {
  lastRequest = null;
  globalThis.fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      lastRequest = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function getHeader(name: string): string | undefined {
  const headers = lastRequest?.init.headers as Record<string, string> | undefined;
  if (!headers) return undefined;
  return headers[name];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LlmClient", () => {
  it("attaches Bearer auth when an apiKey is configured", async () => {
    const client = new LlmClient({
      baseUrl: "https://proxy.example/v1",
      apiKey: "secret-token",
    });

    await client.chatCompletion({
      model: "qwen3-max",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(lastRequest?.url).toBe("https://proxy.example/v1/chat/completions");
    expect(getHeader("Authorization")).toBe("Bearer secret-token");
  });

  it("omits the Authorization header entirely when apiKey is empty", async () => {
    const client = new LlmClient({
      baseUrl: "https://proxy.example/v1",
      apiKey: "",
    });

    await client.chatCompletion({
      model: "qwen3-max",
      messages: [{ role: "user", content: "hi" }],
    });

    // The local Claude proxy doesn't validate auth — sending an empty
    // `Bearer ` header would be wrong, so it must be absent entirely.
    expect(getHeader("Authorization")).toBeUndefined();
    expect(getHeader("Content-Type")).toBe("application/json");
  });

  it("throws LlmHttpError on non-2xx responses", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("upstream broke", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        }),
    ) as unknown as typeof fetch;

    const client = new LlmClient({
      baseUrl: "https://proxy.example/v1",
      apiKey: "",
    });

    await expect(
      client.chatCompletion({
        model: "qwen3-max",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(LlmHttpError);
  });
});
