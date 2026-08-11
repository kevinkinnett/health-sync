import { describe, expect, it } from "vitest";
import type { IntakeRow } from "../services/analytics/ports.js";
import {
  buildAdherence,
  doseSeriesByDay,
  fillSkippedDays,
  shiftIntakeDays,
} from "../services/analytics/intakeAnalysis.js";

function intake(
  takenAt: string,
  amount: number,
  unit: string,
  itemId = 1,
): IntakeRow {
  return { itemId, itemName: "Example", takenAt, amount, unit };
}

describe("intake analysis", () => {
  it("sums uniform doses in the user's local calendar day", () => {
    const result = doseSeriesByDay(
      [
        intake("2026-01-02T01:00:00Z", 0.1, "mg"),
        intake("2026-01-02T02:00:00Z", 0.2, "mg"),
      ],
      "America/New_York",
    );

    expect([...result.days]).toEqual([["2026-01-01", 0.3]]);
    expect(result.xLabel).toBe("Daily dose (mg)");
  });

  it("uses intake counts when units cannot be summed", () => {
    const result = doseSeriesByDay(
      [
        intake("2026-01-01T12:00:00Z", 10, "mg"),
        intake("2026-01-01T18:00:00Z", 1, "tablet"),
      ],
      "UTC",
    );

    expect(result.days.get("2026-01-01")).toBe(2);
    expect(result.xLabel).toBe("Doses taken (count)");
  });

  it("densifies skipped days and never extends beyond the requested end", () => {
    const result = fillSkippedDays(
      new Map([
        ["2026-01-01", 1],
        ["2026-01-03", 2],
        ["2026-01-05", 9],
      ]),
      "2026-01-03",
    );

    expect([...result]).toEqual([
      ["2026-01-01", 1],
      ["2026-01-02", 0],
      ["2026-01-03", 2],
    ]);
  });

  it("shifts a copy of the dose series without mutating its source", () => {
    const source = new Map([["2026-01-01", 4]]);

    expect([...shiftIntakeDays(source, 2)]).toEqual([["2026-01-03", 4]]);
    expect([...source]).toEqual([["2026-01-01", 4]]);
  });

  it("builds dense adherence streaks independently of repository concerns", () => {
    const result = buildAdherence(
      1,
      "Example",
      "2026-01-01",
      "2026-01-04",
      [
        intake("2026-01-01T12:00:00Z", 1, "dose"),
        intake("2026-01-03T12:00:00Z", 1, "dose"),
        intake("2026-01-04T12:00:00Z", 1, "dose"),
      ],
      "UTC",
    );

    expect(result.daily.map((day) => day.doses)).toEqual([1, 0, 1, 1]);
    expect(result.bestStreak).toBe(2);
    expect(result.currentStreak).toBe(2);
  });
});
