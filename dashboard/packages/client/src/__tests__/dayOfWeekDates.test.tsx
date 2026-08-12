import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayOfWeekHeatmap } from "../components/DayOfWeekHeatmap";
import type { DayOfWeekHeatmapData } from "@health-dashboard/shared";

/**
 * Day-of-week columns are multi-week aggregates, not a synthetic current
 * week. These tests pin the honest sample-count and average semantics.
 */

const DATA: DayOfWeekHeatmapData = {
  dayNames: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  dayDates: [],
  rows: [
    { metric: "steps", label: "Steps", unit: "", values: [100, 200, 300, 400, 500, 600, 700], min: 100, max: 700 },
  ],
  totalDays: 7,
  dayCounts: [1, 1, 1, 1, 1, 1, 1],
};

describe("DayOfWeekHeatmap aggregate tooltips", () => {
  it("shows the completed sample count in each weekday header", () => {
    render(<DayOfWeekHeatmap data={DATA} />);
    expect(screen.getByTitle("1 completed Mon samples")).toBeInTheDocument();
    expect(screen.getByTitle("1 completed Sat samples")).toBeInTheDocument();
  });

  it("labels each cell as a weekday average rather than a dated reading", () => {
    render(<DayOfWeekHeatmap data={DATA} />);
    const cell = screen.getByTitle(/Steps weekday average: 200/);
    expect(cell).toBeInTheDocument();
  });
});
