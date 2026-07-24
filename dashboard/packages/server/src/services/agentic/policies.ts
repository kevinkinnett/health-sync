/**
 * The loop policies, each isolated and independently testable.
 *
 * `runAgenticLoop` accumulated five separate concerns as inline state —
 * a wall-clock budget, a stuck-signature window, a nag allowance, a
 * required-tool ledger and a session-restart allowance — interleaved with
 * the orchestration itself. That made the rules impossible to test in
 * isolation and easy to get subtly wrong (the round counter was derived
 * from the stuck window's sliding array, which silently capped it at 3).
 *
 * Each policy here owns exactly one rule and can be exercised directly.
 * The orchestrator composes them and stays a readable sequence.
 */

/** Wall-clock ceiling for the whole loop, restarts included. */
export class BudgetClock {
  constructor(
    private readonly budgetMs: number,
    private readonly startedAt: number = Date.now(),
  ) {}

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  get budget(): number {
    return this.budgetMs;
  }

  expired(): boolean {
    return this.elapsedMs > this.budgetMs;
  }
}

/**
 * Detects a model spinning on the same tool call. Keeps a sliding window
 * of the last `depth` tool-call signatures; "stuck" means the window is
 * full and every entry is identical.
 *
 * NOTE: this window is intentionally NOT a round counter — it saturates
 * at `depth`. Round counting lives in the orchestrator.
 */
export class StuckDetector {
  private readonly window: string[] = [];

  constructor(private readonly depth: number = 3) {}

  record(signature: string): void {
    this.window.push(signature);
    while (this.window.length > this.depth) this.window.shift();
  }

  isStuck(): boolean {
    return (
      this.window.length === this.depth &&
      this.window.every((s) => s === this.window[0])
    );
  }

  reset(): void {
    this.window.length = 0;
  }
}

/** A bounded allowance for corrective retries. */
export class Allowance {
  private used = 0;

  constructor(private readonly max: number) {}

  get spent(): number {
    return this.used;
  }

  /** Consumes one unit if any remain. Returns false when exhausted. */
  tryUse(): boolean {
    if (this.used >= this.max) return false;
    this.used++;
    return true;
  }

  reset(): void {
    this.used = 0;
  }
}

/**
 * Ledger of tools the caller demanded versus tools actually invoked.
 * Drives `tool_choice` pinning, the nag target and the placeholder text.
 */
export class RequiredTools {
  private readonly required: ReadonlySet<string>;
  private readonly called = new Set<string>();

  constructor(required: Iterable<string> = []) {
    this.required = new Set(required);
  }

  markCalled(name: string): void {
    this.called.add(name);
  }

  /** Required tools not yet invoked, in declaration order. */
  missing(): string[] {
    return [...this.required].filter((t) => !this.called.has(t));
  }

  satisfied(): boolean {
    return this.missing().length === 0;
  }

  /** Every tool invoked this loop, required or not. */
  invoked(): string[] {
    return [...this.called];
  }

  get invokedCount(): number {
    return this.called.size;
  }

  /** Forget what was called — used when replaying after a session reset. */
  reset(): void {
    this.called.clear();
  }
}
