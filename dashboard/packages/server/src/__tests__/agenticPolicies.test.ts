import { describe, it, expect } from "vitest";
import {
  Allowance,
  BudgetClock,
  RequiredTools,
  StuckDetector,
  ToolCallBudget,
} from "../services/agentic/policies.js";

/**
 * These rules used to be inline state inside `runAgenticLoop`, reachable
 * only by driving a whole fake LLM conversation. Extracted, each one is
 * checkable directly — including the edge cases the loop tests can't
 * easily stage (a full-but-mixed stuck window, an exhausted allowance).
 */

describe("BudgetClock", () => {
  it("is not expired before the budget elapses", () => {
    const clock = new BudgetClock(1000, Date.now());
    expect(clock.expired()).toBe(false);
  });

  it("is expired once the budget has passed", () => {
    // Start the clock in the past rather than sleeping.
    const clock = new BudgetClock(1000, Date.now() - 5000);
    expect(clock.expired()).toBe(true);
    expect(clock.elapsedMs).toBeGreaterThanOrEqual(5000);
  });

  it("exposes its configured budget for logging", () => {
    expect(new BudgetClock(1234).budget).toBe(1234);
  });
});

describe("StuckDetector", () => {
  it("is not stuck until the window is full", () => {
    const d = new StuckDetector(3);
    d.record("a");
    d.record("a");
    expect(d.isStuck()).toBe(false);
  });

  it("is stuck on three identical signatures in a row", () => {
    const d = new StuckDetector(3);
    d.record("a");
    d.record("a");
    d.record("a");
    expect(d.isStuck()).toBe(true);
  });

  it("is not stuck when the window is full but mixed", () => {
    const d = new StuckDetector(3);
    d.record("a");
    d.record("b");
    d.record("a");
    expect(d.isStuck()).toBe(false);
  });

  it("slides: an older differing entry falls out of the window", () => {
    const d = new StuckDetector(3);
    d.record("x"); // falls out
    d.record("a");
    d.record("a");
    expect(d.isStuck()).toBe(false);
    d.record("a"); // window is now a,a,a
    expect(d.isStuck()).toBe(true);
  });

  it("reset clears the window", () => {
    const d = new StuckDetector(3);
    d.record("a");
    d.record("a");
    d.record("a");
    d.reset();
    expect(d.isStuck()).toBe(false);
  });
});

describe("Allowance", () => {
  it("permits exactly max uses", () => {
    const a = new Allowance(2);
    expect(a.tryUse()).toBe(true);
    expect(a.tryUse()).toBe(true);
    expect(a.tryUse()).toBe(false);
    expect(a.spent).toBe(2);
  });

  it("a zero allowance permits nothing", () => {
    expect(new Allowance(0).tryUse()).toBe(false);
  });

  it("reset restores the full allowance", () => {
    const a = new Allowance(1);
    a.tryUse();
    expect(a.tryUse()).toBe(false);
    a.reset();
    expect(a.tryUse()).toBe(true);
  });
});

describe("ToolCallBudget", () => {
  it("counts executions independently from tool identity", () => {
    const budget = new ToolCallBudget(2);
    expect(budget.tryUse()).toBe(true);
    expect(budget.tryUse()).toBe(true);
    expect(budget.tryUse()).toBe(false);
    expect(budget.spent).toBe(2);
    expect(budget.remaining).toBe(0);
    expect(budget.exhausted).toBe(true);
  });

  it("normalizes invalid limits and can be reset for a session replay", () => {
    const budget = new ToolCallBudget(-4);
    expect(budget.max).toBe(0);
    expect(budget.tryUse()).toBe(false);
    expect(new ToolCallBudget(Number.NaN).max).toBe(0);

    const replayed = new ToolCallBudget(1);
    replayed.tryUse();
    replayed.reset();
    expect(replayed.remaining).toBe(1);
    expect(replayed.tryUse()).toBe(true);
  });
});

describe("RequiredTools", () => {
  it("an empty requirement set is satisfied immediately", () => {
    const t = new RequiredTools([]);
    expect(t.satisfied()).toBe(true);
    expect(t.missing()).toEqual([]);
  });

  it("tracks missing tools in declaration order", () => {
    const t = new RequiredTools(["a", "b", "c"]);
    t.markCalled("b");
    expect(t.missing()).toEqual(["a", "c"]);
    expect(t.satisfied()).toBe(false);
  });

  it("is satisfied once every required tool is called", () => {
    const t = new RequiredTools(["a", "b"]);
    t.markCalled("a");
    t.markCalled("b");
    expect(t.satisfied()).toBe(true);
  });

  it("records non-required tools as invoked without affecting satisfaction", () => {
    const t = new RequiredTools(["a"]);
    t.markCalled("extra");
    expect(t.satisfied()).toBe(false);
    expect(t.invoked()).toContain("extra");
    expect(t.invokedCount).toBe(1);
  });

  it("dedupes repeated calls to the same tool", () => {
    const t = new RequiredTools(["a"]);
    t.markCalled("a");
    t.markCalled("a");
    expect(t.invokedCount).toBe(1);
  });

  it("reset forgets calls but keeps the requirements (session replay)", () => {
    const t = new RequiredTools(["a", "b"]);
    t.markCalled("a");
    t.reset();
    expect(t.invoked()).toEqual([]);
    expect(t.missing()).toEqual(["a", "b"]);
  });
});
