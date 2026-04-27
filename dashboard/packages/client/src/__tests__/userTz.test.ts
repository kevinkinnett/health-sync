import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  detectBrowserTz,
  formatDateInTz,
  todayInTz,
} from "../lib/userTz";

describe("client userTz helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formatDateInTz", () => {
    it("buckets a UTC instant to the user's calendar day", () => {
      // 03:00 UTC on Apr 28 == 23:00 EDT on Apr 27.
      const instant = new Date("2026-04-28T03:00:00.000Z");
      expect(formatDateInTz(instant, "America/New_York")).toBe("2026-04-27");
      expect(formatDateInTz(instant, "UTC")).toBe("2026-04-28");
    });

    it("handles spring-forward (EDT begins 2026-03-08)", () => {
      // 06:30 UTC on Mar 8 == 02:30 EDT (just after the jump from 02:00 EST).
      const instant = new Date("2026-03-08T06:30:00.000Z");
      expect(formatDateInTz(instant, "America/New_York")).toBe("2026-03-08");
    });

    it("handles fall-back (EST resumes 2026-11-01)", () => {
      // 05:30 UTC on Nov 1 == 01:30 EDT *or* 00:30 EST depending on which
      // pass through the ambiguous hour. Either way the calendar day is
      // 2026-11-01 in Eastern.
      const instant = new Date("2026-11-01T05:30:00.000Z");
      expect(formatDateInTz(instant, "America/New_York")).toBe("2026-11-01");
    });

    it("accepts an ISO string as input", () => {
      expect(formatDateInTz("2026-04-28T03:00:00.000Z", "America/New_York"))
        .toBe("2026-04-27");
    });
  });

  describe("todayInTz", () => {
    it("returns yesterday-in-Eastern when called late on UTC's today", () => {
      vi.setSystemTime(new Date("2026-04-28T03:00:00.000Z"));
      expect(todayInTz("America/New_York")).toBe("2026-04-27");
      expect(todayInTz("UTC")).toBe("2026-04-28");
    });
  });

  describe("addDays", () => {
    it("adds and subtracts whole calendar days", () => {
      expect(addDays("2026-04-27", 1)).toBe("2026-04-28");
      expect(addDays("2026-04-27", -30)).toBe("2026-03-28");
    });

    it("crosses month boundaries", () => {
      expect(addDays("2026-04-30", 1)).toBe("2026-05-01");
      expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    });

    it("crosses the spring-forward DST boundary cleanly", () => {
      // 7 days back from Mar 15 (EDT) to Mar 8 (the DST jump day) — the
      // calendar arithmetic should be exact, not 6.96 days.
      expect(addDays("2026-03-15", -7)).toBe("2026-03-08");
      // And forward across the gap.
      expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    });

    it("crosses the fall-back DST boundary cleanly", () => {
      expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
      expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    });
  });

  describe("detectBrowserTz", () => {
    it("returns a non-empty IANA name", () => {
      const tz = detectBrowserTz();
      expect(typeof tz).toBe("string");
      expect(tz.length).toBeGreaterThan(0);
    });
  });
});
