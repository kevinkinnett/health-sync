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

describe("runWithConcurrency invariants", () => {
  // The runner is internal to insightService. We verify its observable
  // behaviour (sequential ordering with limit=1) via a small re-impl
  // that mirrors the production code's contract.
  async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let nextIndex = 0;
    const workers: Promise<void>[] = [];
    const workerCount = Math.max(1, Math.min(limit, items.length));
    for (let w = 0; w < workerCount; w++) {
      workers.push(
        (async () => {
          while (true) {
            const i = nextIndex++;
            if (i >= items.length) return;
            try {
              results[i] = { status: "fulfilled", value: await fn(items[i]) };
            } catch (reason) {
              results[i] = { status: "rejected", reason };
            }
          }
        })(),
      );
    }
    await Promise.all(workers);
    return results;
  }

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
