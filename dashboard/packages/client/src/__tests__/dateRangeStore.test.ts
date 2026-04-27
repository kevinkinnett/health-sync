import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDateRangeStore } from "../stores/dateRangeStore";

describe("Date range store", () => {
  // Reset to a known baseline before each test so tests are order-independent
  // and don't pollute each other through the singleton zustand store.
  beforeEach(() => {
    useDateRangeStore.setState((s) => ({
      ...s,
      preset: "30d",
      start: "2026-03-28",
      end: "2026-04-27",
      tz: "America/New_York",
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  describe("setTz", () => {
    it("no-ops when the new TZ matches the current TZ", () => {
      const before = useDateRangeStore.getState();
      useDateRangeStore.getState().setTz(before.tz);
      const after = useDateRangeStore.getState();
      // Reference equality is enough — the store should not have updated.
      expect(after.start).toBe(before.start);
      expect(after.end).toBe(before.end);
      expect(after.tz).toBe(before.tz);
    });

    it("recomputes the rolling window when the TZ changes", () => {
      // Late evening Eastern, but UTC has already rolled into the next day.
      // 11pm Eastern on 2026-04-27 = 03:00 UTC on 2026-04-28.
      vi.setSystemTime(new Date("2026-04-28T03:00:00.000Z"));

      // First in UTC: end is 2026-04-28 (UTC's "today").
      useDateRangeStore.getState().setTz("UTC");
      let state = useDateRangeStore.getState();
      expect(state.end).toBe("2026-04-28");
      expect(state.start).toBe("2026-03-29"); // 30 days back

      // Then in Eastern: end is 2026-04-27 (still the user's "today").
      useDateRangeStore.getState().setTz("America/New_York");
      state = useDateRangeStore.getState();
      expect(state.end).toBe("2026-04-27");
      expect(state.start).toBe("2026-03-28"); // 30 days back
    });

    it("'all' preset only updates the TZ, not the absolute start date", () => {
      useDateRangeStore.getState().setPreset("all");
      useDateRangeStore.getState().setTz("UTC");
      const state = useDateRangeStore.getState();
      expect(state.preset).toBe("all");
      expect(state.start).toBe("2020-01-01");
      expect(state.tz).toBe("UTC");
    });

    it("late-evening Eastern returns the user's calendar today, not UTC's tomorrow", () => {
      // 11:30pm EDT on 2026-07-04 = 03:30 UTC on 2026-07-05. Without
      // TZ-awareness the default "today" would silently become 2026-07-05,
      // which is the bug pattern that caused the 1199-step gap in the
      // original timezone investigation.
      vi.setSystemTime(new Date("2026-07-05T03:30:00.000Z"));
      useDateRangeStore.getState().setTz("America/New_York");
      useDateRangeStore.getState().setPreset("7d");
      const state = useDateRangeStore.getState();
      expect(state.end).toBe("2026-07-04");
      expect(state.start).toBe("2026-06-27");
    });
  });
});
