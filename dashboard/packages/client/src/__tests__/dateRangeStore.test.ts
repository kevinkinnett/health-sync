import { describe, it, expect } from "vitest";
import { useDateRangeStore } from "../stores/dateRangeStore";

describe("Date range store", () => {
  it("defaults to 30-day range", () => {
    const state = useDateRangeStore.getState();
    expect(state.preset).toBe("30d");
    expect(state.start).toBeTruthy();
    expect(state.end).toBeTruthy();

    const diffDays = Math.round(
      (new Date(state.end).getTime() - new Date(state.start).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(30);
  });

  it("setPreset(7d) narrows the range to 7 days", () => {
    useDateRangeStore.getState().setPreset("7d");
    const state = useDateRangeStore.getState();
    expect(state.preset).toBe("7d");

    const diffDays = Math.round(
      (new Date(state.end).getTime() - new Date(state.start).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    expect(diffDays).toBe(7);
  });

  it("setPreset(all) starts from 2020", () => {
    useDateRangeStore.getState().setPreset("all");
    const state = useDateRangeStore.getState();
    expect(state.start).toBe("2020-01-01");
  });

  it("setCustomRange overrides dates", () => {
    useDateRangeStore
      .getState()
      .setCustomRange("2026-01-01", "2026-03-01");
    const state = useDateRangeStore.getState();
    expect(state.start).toBe("2026-01-01");
    expect(state.end).toBe("2026-03-01");
  });
});
