import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DoseResponseSummary } from "@health-dashboard/shared";
import { DoseDistribution } from "../components/charts/DoseDistribution";

// Observable Plot measures the DOM, which jsdom can't do — stub it. We test
// the panel-selection logic around it; the math is covered server-side.
vi.mock("@observablehq/plot", () => ({
  plot: () => document.createElement("div"),
  boxY: () => ({}),
}));

function summary(
  metrics: DoseResponseSummary["metrics"],
): DoseResponseSummary {
  return {
    itemId: 1,
    itemName: "Escitalopram",
    xLabel: "Daily dose (mg)",
    levels: [
      { dose: 0, days: 2, firstDay: "2026-05-01", lastDay: "2026-05-02" },
      { dose: 10, days: 3, firstDay: "2026-05-08", lastDay: "2026-05-10" },
      { dose: 20, days: 3, firstDay: "2026-03-07", lastDay: "2026-03-09" },
    ],
    metrics,
  };
}

describe("DoseDistribution", () => {
  it("renders a box panel only for metrics with data at ≥2 dose levels", () => {
    render(
      <DoseDistribution
        data={summary([
          {
            metric: "sleepMin",
            metricLabel: "Sleep (min)",
            byLevel: [
              { dose: 0, n: 2, mean: 350, values: [340, 360] },
              { dose: 10, n: 3, mean: 440, values: [430, 440, 450] },
              { dose: 20, n: 3, mean: 370, values: [360, 370, 380] },
            ],
          },
          {
            // only one level has any readings → not comparable → skipped
            metric: "steps",
            metricLabel: "Steps",
            byLevel: [
              { dose: 0, n: 0, mean: 0, values: [] },
              { dose: 10, n: 1, mean: 5000, values: [5000] },
            ],
          },
        ])}
      />,
    );
    expect(screen.getByText("Sleep (min)")).toBeInTheDocument();
    expect(screen.queryByText("Steps")).not.toBeInTheDocument();
    // The "overlap = noise" guidance is present so the read is teachable.
    expect(screen.getByText(/overlap heavily mean the difference is likely noise/i)).toBeInTheDocument();
  });

  it("renders nothing when no metric has comparable distributions", () => {
    const { container } = render(
      <DoseDistribution
        data={summary([
          {
            metric: "sleepMin",
            metricLabel: "Sleep (min)",
            byLevel: [{ dose: 10, n: 2, mean: 440, values: [430, 450] }],
          },
        ])}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
