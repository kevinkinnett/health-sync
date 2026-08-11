import { describe, expect, it, vi } from "vitest";
import {
  LlmHttpError,
  LlmStreamError,
  retryBackoffMs,
  withTransientLlmRetries,
} from "../services/llmClient.js";

describe("LLM retry policy", () => {
  it("uses the bounded backoff schedule", () => {
    expect([0, 1, 2, 3, 10].map(retryBackoffMs)).toEqual([
      500,
      1500,
      4000,
      4000,
      4000,
    ]);
  });

  it("retries retryable HTTP and mid-stream failures", async () => {
    const failures = [
      new LlmHttpError(503, "down"),
      new LlmStreamError("overloaded_error", "busy", true),
    ];
    const operation = vi.fn(async () => {
      const failure = failures.shift();
      if (failure) throw failure;
      return "ok";
    });
    const sleep = vi.fn(async () => undefined);
    const onRetry = vi.fn();

    await expect(
      withTransientLlmRetries(operation, { retries: 2, sleep, onRetry }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sleep).toHaveBeenNthCalledWith(2, 1500);
    expect(onRetry).toHaveBeenNthCalledWith(2, {
      attempt: 2,
      retries: 2,
      backoffMs: 1500,
    });
  });

  it("does not retry caller, protocol, or session-expiry failures", async () => {
    for (const error of [
      new LlmHttpError(400, "bad request"),
      new LlmHttpError(410, '{"type":"session_expired"}'),
      new LlmStreamError("protocol_error", "bad event", false),
    ]) {
      const operation = vi.fn(async () => {
        throw error;
      });
      await expect(
        withTransientLlmRetries(operation, {
          retries: 2,
          sleep: async () => undefined,
        }),
      ).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(1);
    }
  });
});
