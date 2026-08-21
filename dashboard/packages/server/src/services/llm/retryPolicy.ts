import {
  isLlmAuthenticationRequired,
  LlmHttpError,
  LlmStreamError,
} from "./errors.js";

const TRANSIENT_BACKOFF_MS = [500, 1500, 4000] as const;

export interface RetryNotice {
  attempt: number;
  retries: number;
  backoffMs: number;
}

export interface RetryOptions {
  retries: number;
  onRetry?: (notice: RetryNotice) => void;
  sleep?: (milliseconds: number) => Promise<void>;
}

export function isTransientLlmError(error: unknown): boolean {
  if (error instanceof LlmHttpError) {
    return error.status >= 500 && !isLlmAuthenticationRequired(error);
  }
  return error instanceof LlmStreamError && error.retryable;
}

export function retryBackoffMs(attempt: number): number {
  return TRANSIENT_BACKOFF_MS[
    Math.min(attempt, TRANSIENT_BACKOFF_MS.length - 1)
  ];
}

export async function withTransientLlmRetries<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const retries = Math.max(0, options.retries);
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || !isTransientLlmError(error)) throw error;

      const backoffMs = retryBackoffMs(attempt);
      options.onRetry?.({ attempt: attempt + 1, retries, backoffMs });
      await sleep(backoffMs);
      attempt++;
    }
  }
}
