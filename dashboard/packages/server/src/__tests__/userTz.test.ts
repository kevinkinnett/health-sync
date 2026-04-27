import { describe, it, expect } from "vitest";
import {
  formatDateInTz,
  todayInTz,
  addDays,
  tzDayStartUtc,
  tzDayEndUtc,
} from "../services/userTz.js";

const NY = "America/New_York";

describe("formatDateInTz", () => {
  it("buckets a late-evening EDT instant into the same calendar day", () => {
    // 8 PM EDT on April 26 — 00:00 UTC on April 27.
    expect(formatDateInTz("2026-04-26T20:00:00-04:00", NY)).toBe("2026-04-26");
  });

  it("buckets a midnight-after EDT instant into the next day", () => {
    // 1 AM EDT on April 27 — clearly the next day in NY.
    expect(formatDateInTz("2026-04-27T01:00:00-04:00", NY)).toBe("2026-04-27");
  });

  it("agrees with UTC for a UTC-zoned bucket", () => {
    // Same instant; different zone yields a different day boundary.
    expect(formatDateInTz("2026-04-26T20:00:00-04:00", "UTC")).toBe(
      "2026-04-27",
    );
  });

  it("handles spring-forward (Mar 8 2026): pre-DST and post-DST stamps both bucket as Mar 8", () => {
    // 1 AM EST and 5 AM EDT on the same wall-clock date — both March 8.
    expect(formatDateInTz("2026-03-08T01:30:00-05:00", NY)).toBe("2026-03-08");
    expect(formatDateInTz("2026-03-08T05:00:00-04:00", NY)).toBe("2026-03-08");
  });

  it("handles fall-back (Nov 1 2026): both 1:30am instants bucket as Nov 1", () => {
    // The clock reads 1:30 AM twice on this date — once EDT, once EST.
    expect(formatDateInTz("2026-11-01T01:30:00-04:00", NY)).toBe("2026-11-01");
    expect(formatDateInTz("2026-11-01T01:30:00-05:00", NY)).toBe("2026-11-01");
  });
});

describe("todayInTz", () => {
  it("returns a YYYY-MM-DD string for a known IANA zone", () => {
    expect(todayInTz(NY)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays("2026-04-26", 1)).toBe("2026-04-27");
    expect(addDays("2026-04-26", 30)).toBe("2026-05-26");
  });

  it("subtracts days", () => {
    expect(addDays("2026-04-26", -7)).toBe("2026-04-19");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("is unaffected by DST gaps", () => {
    // March 7 → March 14 spans the spring-forward, but as calendar days
    // the offset is exactly 7 — no missing 23-hour day.
    expect(addDays("2026-03-07", 7)).toBe("2026-03-14");
    expect(addDays("2026-10-31", 7)).toBe("2026-11-07");
  });
});

describe("tzDayStartUtc", () => {
  it("resolves to UTC-4 during EDT", () => {
    expect(tzDayStartUtc("2026-04-26", NY)).toBe("2026-04-26T04:00:00.000Z");
  });

  it("resolves to UTC-5 during EST", () => {
    expect(tzDayStartUtc("2026-01-15", NY)).toBe("2026-01-15T05:00:00.000Z");
  });

  it("resolves to UTC midnight for UTC zone", () => {
    expect(tzDayStartUtc("2026-04-26", "UTC")).toBe("2026-04-26T00:00:00.000Z");
  });

  it("handles DST-transition dates correctly", () => {
    // March 8 starts at midnight EST (UTC-5), even though by 3 AM the
    // clock has jumped to EDT. Midnight is always unambiguous.
    expect(tzDayStartUtc("2026-03-08", NY)).toBe("2026-03-08T05:00:00.000Z");
    // November 1 starts at midnight EDT (UTC-4); fall-back happens at 2 AM.
    expect(tzDayStartUtc("2026-11-01", NY)).toBe("2026-11-01T04:00:00.000Z");
  });

  it("agrees with formatDateInTz when round-tripping the lower bound", () => {
    const start = tzDayStartUtc("2026-04-26", NY);
    expect(formatDateInTz(start, NY)).toBe("2026-04-26");
  });
});

describe("tzDayEndUtc", () => {
  it("returns one millisecond before the next day's start", () => {
    expect(tzDayEndUtc("2026-04-26", NY)).toBe("2026-04-27T03:59:59.999Z");
  });

  it("formats correctly during EST", () => {
    expect(tzDayEndUtc("2026-01-15", NY)).toBe("2026-01-16T04:59:59.999Z");
  });

  it("a TIMESTAMPTZ at the boundary sits inside the day", () => {
    // The very last millisecond of April 26 in NY should still bucket as
    // April 26 in the same zone.
    const end = tzDayEndUtc("2026-04-26", NY);
    expect(formatDateInTz(end, NY)).toBe("2026-04-26");
  });
});
