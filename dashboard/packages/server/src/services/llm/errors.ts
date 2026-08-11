export class LlmHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`LLM proxy returned ${status}: ${body.slice(0, 200)}`);
    this.name = "LlmHttpError";
  }
}

export class LlmStreamError extends Error {
  constructor(
    public readonly errorType: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(`LLM stream error (${errorType}): ${message}`);
    this.name = "LlmStreamError";
  }
}

/** The proxy session must be replayed by the agentic loop, not retried in place. */
export function isSessionExpired(err: unknown): boolean {
  return (
    err instanceof LlmHttpError && err.status === 410 && /session_expired/.test(err.body)
  );
}
