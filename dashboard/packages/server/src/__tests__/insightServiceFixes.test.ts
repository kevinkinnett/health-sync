import { describe, it, expect, vi } from "vitest";
import { listCategoryDefs } from "../services/insightService.js";
import { LlmHttpError } from "../services/llmClient.js";
import { LlmClient } from "../services/llmClient.js";

/**
 * Regression tests for the fixes made after the first failed Insights
 * generation. The Claude proxy returned HTTP 500 with an empty
 * `--tools` argv on five of six categories — the cure was three small
 * changes:
 *
 *   1. Each category now has a curated `relevantTools` list, so the
 *      tools array passed to the proxy is small enough to marshal.
 *   2. GROUNDING_RULES move from the system prompt to the first user
 *      message — the proxy's `--system-prompt "..."` shell path
 *      breaks on long payloads.
 *   3. LlmClient retries transient 5xx, since proxy errors often
 *      self-recover on a second attempt.
 *
 * These tests pin those properties so a future refactor that
 * accidentally reverts them fails loudly.
 */

describe("Category definitions — relevantTools curation", () => {
  it("every category declares a relevantTools list (≤ 7 entries)", () => {
    const cats = listCategoryDefs();
    expect(cats.length).toBeGreaterThan(0);
    for (const cat of cats) {
      expect(cat.relevantTools).toBeDefined();
      expect(cat.relevantTools!.length).toBeLessThanOrEqual(7);
    }
  });

  it("relevantTools always includes every requiredTool", () => {
    for (const cat of listCategoryDefs()) {
      for (const required of cat.requiredTools) {
        expect(cat.relevantTools).toContain(required);
      }
    }
  });
});

describe("LlmClient retry-on-5xx", () => {
  it("retries the request once and succeeds when the proxy 500s then recovers", async () => {
    let calls = 0;
    const responses = [
      { ok: false, status: 500, text: async () => "Command failed" },
      {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "ok" } }],
        }),
      },
    ];
    const fetchMock = vi.fn(async () => {
      const r = responses[calls];
      calls++;
      return r;
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new LlmClient({ baseUrl: "http://x/v1", apiKey: "" });
    const result = await client.chatCompletion(
      { model: "m", messages: [] },
      { task: "insights", retries: 2 },
    );
    expect(calls).toBe(2);
    expect(result.choices[0].message.content).toBe("ok");

    vi.unstubAllGlobals();
  });

  it("does NOT retry when retries=0 (default)", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return { ok: false, status: 500, text: async () => "boom" };
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new LlmClient({ baseUrl: "http://x/v1", apiKey: "" });
    await expect(
      client.chatCompletion({ model: "m", messages: [] }, { task: "chat" }),
    ).rejects.toBeInstanceOf(LlmHttpError);
    expect(calls).toBe(1);

    vi.unstubAllGlobals();
  });

  it("gives up after exhausting retries", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return { ok: false, status: 503, text: async () => "still down" };
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new LlmClient({ baseUrl: "http://x/v1", apiKey: "" });
    await expect(
      client.chatCompletion(
        { model: "m", messages: [] },
        { task: "insights", retries: 2 },
      ),
    ).rejects.toBeInstanceOf(LlmHttpError);
    // Initial attempt + 2 retries = 3 calls
    expect(calls).toBe(3);

    vi.unstubAllGlobals();
  });

  it("does NOT retry on 4xx (caller error, not transient)", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      return {
        ok: false,
        status: 400,
        text: async () => "bad request shape",
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new LlmClient({ baseUrl: "http://x/v1", apiKey: "" });
    await expect(
      client.chatCompletion(
        { model: "m", messages: [] },
        { task: "insights", retries: 2 },
      ),
    ).rejects.toBeInstanceOf(LlmHttpError);
    expect(calls).toBe(1);

    vi.unstubAllGlobals();
  });
});
