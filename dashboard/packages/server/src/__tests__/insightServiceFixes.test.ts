import { describe, it, expect, vi } from "vitest";
import {
  InsightService,
  listCategoryDefs,
  runWithConcurrency,
} from "../services/insightService.js";
import { LlmHttpError } from "../services/llmClient.js";
import { LlmClient } from "../services/llmClient.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../services/llmClient.js";
import type { InsightRepository } from "../repositories/insightRepo.js";
import type { V1Context } from "../api/v1/endpoints.js";

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

describe("runWithConcurrency invariants", () => {
  // Tests the REAL production function — the prior version re-implemented
  // the runner locally and tested the copy, which would have stayed green
  // even if the production runner was broken. Audit #13.

  it("with limit=1, never has two items in flight simultaneously", async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const items = [1, 2, 3, 4, 5];
    await runWithConcurrency(items, 1, async (n) => {
      inFlight++;
      maxObserved = Math.max(maxObserved, inFlight);
      // Yield once to let any racing worker observe a higher count.
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      inFlight--;
      return n * 2;
    });
    // The whole point of limit=1: only one `claude -p` subprocess at a
    // time, sidestepping the proxy's concurrent-marshalling race.
    expect(maxObserved).toBe(1);
  });
});

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

describe("InsightService.generate tool filtering", () => {
  // The static tests above prove each CategoryDef DECLARES a curated
  // relevantTools list. This proves generate() actually HONORS it —
  // i.e. the tools array passed to the LLM for each category equals
  // that category's relevantTools, no more, no less. That's the
  // property the proxy-race fix depends on; without this test a
  // refactor that reverted to passing all 19 tools would pass the
  // static checks but reintroduce the production failure.
  //
  // It doubles as a sync check: if a relevantTools entry named a tool
  // that buildHealthTools() doesn't actually derive from a v1 endpoint,
  // the filtered array would be a strict subset and the equality
  // assertion would fail — surfacing a curated list that lies about
  // what the model can call.

  function sigOf(names: readonly string[]): string {
    return [...names].sort().join(",");
  }

  it("passes exactly each category's relevantTools to the LLM", async () => {
    // Capture the tool-name set of every chatCompletion call.
    const capturedSignatures = new Set<string>();
    const llm = {
      chatCompletion: vi.fn(
        async (req: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
          const names = (req.tools ?? []).map((t) => t.function.name);
          capturedSignatures.add(sigOf(names));
          // Plain-text response — the loop will nag (required tools
          // never "called") and bail to a placeholder after maxNags.
          // Every call within a category carries the same tools array,
          // so one captured signature per category is enough.
          return { choices: [{ message: { content: "ok" } }] };
        },
      ),
    } as unknown as LlmClient;

    const repo = {
      insertCategoryRow: vi.fn(async () => undefined),
    } as unknown as InsightRepository;

    const v1Ctx = { userTimezone: "America/New_York" } as unknown as V1Context;
    const service = new InsightService(repo, llm, v1Ctx, {
      model: "test-model",
    });

    await service.generate({ dateFrom: "2026-01-01", dateTo: "2026-01-31" });

    // Every category's relevantTools set must appear verbatim among the
    // captured signatures.
    for (const cat of listCategoryDefs()) {
      const expected = sigOf(cat.relevantTools ?? cat.requiredTools);
      expect(
        capturedSignatures.has(expected),
        `category "${cat.key}" expected tools [${expected}] not found in captured signatures`,
      ).toBe(true);
    }

    // And no call carried a tool set that doesn't belong to some
    // category — guards against a stray "all tools" leak.
    const validSignatures = new Set(
      listCategoryDefs().map((c) => sigOf(c.relevantTools ?? c.requiredTools)),
    );
    for (const sig of capturedSignatures) {
      expect(
        validSignatures.has(sig),
        `unexpected tool signature passed to LLM: [${sig}]`,
      ).toBe(true);
    }

    // Every category persisted a row (placeholder content is fine).
    expect(repo.insertCategoryRow).toHaveBeenCalledTimes(
      listCategoryDefs().length,
    );
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
        // Anthropic Messages shape — the client translates it to the
        // OpenAI-shaped result the rest of the app consumes.
        json: async () => ({
          content: [{ type: "text", text: "ok" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
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
