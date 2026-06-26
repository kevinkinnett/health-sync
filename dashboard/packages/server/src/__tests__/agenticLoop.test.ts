import { describe, it, expect } from "vitest";
import { runAgenticLoop } from "../services/agenticLoop.js";
import {
  LlmHttpError,
  type ChatCompletionResponse,
  type LlmClient,
} from "../services/llmClient.js";

function textResponse(content: string): ChatCompletionResponse {
  return { choices: [{ message: { content }, finish_reason: "stop" }] };
}

const SESSION_EXPIRED = () =>
  new LlmHttpError(410, JSON.stringify({ error: { type: "session_expired" } }));

describe("runAgenticLoop — proxy session-expiry recovery", () => {
  it("replays from the first user turn on 410 session_expired, then completes", async () => {
    let calls = 0;
    const llm = {
      chatCompletion: async () => {
        calls++;
        if (calls === 1) throw SESSION_EXPIRED();
        return textResponse("grounded answer");
      },
    } as unknown as LlmClient;

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
  });

  it("gives up with a placeholder when the session expires again after the one allowed restart", async () => {
    let calls = 0;
    const llm = {
      chatCompletion: async () => {
        calls++;
        throw SESSION_EXPIRED();
      },
    } as unknown as LlmClient;

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
  });

  it("does not restart on an ordinary 500 (that path emits a placeholder)", async () => {
    let calls = 0;
    const llm = {
      chatCompletion: async () => {
        calls++;
        throw new LlmHttpError(500, "boom");
      },
    } as unknown as LlmClient;

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
  });
});
