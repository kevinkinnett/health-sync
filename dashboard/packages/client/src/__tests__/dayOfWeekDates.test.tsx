import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayOfWeekHeatmap } from "../components/DayOfWeekHeatmap";
import type { DayOfWeekHeatmapData } from "@health-dashboard/shared";

/**
 * Day-of-week columns are 90-day averages but are rotated to align with the
 * current rolling week, so each column maps to a real calendar date. These
 * pin that the actual date is surfaced on hover (the `title` tooltip) on the
 * column header and the cells.
 */

const DATA: DayOfWeekHeatmapData = {
  dayNames: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  dayDates: ["2026-05-24", "2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30"],
  rows: [
    { metric: "steps", label: "Steps", unit: "", values: [100, 200, 300, 400, 500, 600, 700], min: 100, max: 700 },
  ],
  totalDays: 7,
  dayCounts: [1, 1, 1, 1, 1, 1, 1],
};

describe("DayOfWeekHeatmap date-on-hover", () => {
  it("shows the actual date in the column header tooltip", () => {
    render(<DayOfWeekHeatmap data={DATA} />);
    // "Mon" column → 2026-05-25 → "Monday, May 25".
    expect(screen.getByTitle("Monday, May 25")).toBeInTheDocument();
    expect(screen.getByTitle("Saturday, May 30")).toBeInTheDocument();
  });

  it("includes the date in each cell's tooltip", () => {
    render(<DayOfWeekHeatmap data={DATA} />);
    // Steps cell for Monday carries the metric, the date, and the value.
    const cell = screen.getByTitle(/Steps · May 25: 200/);
    expect(cell).toBeInTheDocument();
  });
});
