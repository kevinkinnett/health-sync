import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LagProfile } from "@health-dashboard/shared";
import { LagCurve } from "../components/charts/LagCurve";

vi.mock("@observablehq/plot", () => ({
  plot: () => document.createElement("div"),
  line: () => ({}),
  dot: () => ({}),
  rect: () => ({}),
  ruleY: () => ({}),
}));

function profile(metrics: LagProfile["metrics"]): LagProfile {
  return { itemId: 1, itemName: "Escitalopram", maxLag: 7, metrics };
}

describe("LagCurve", () => {
  it("renders the chart section when at least one metric has a non-null point", () => {
    render(
      <LagCurve
        data={profile([
          {
            metric: "sleepMin",
            metricLabel: "Sleep (min)",
            points: [
              { lag: 0, r: -0.18, n: 80 },
              { lag: 1, r: -0.47, n: 80 },
              { lag: 2, r: -0.25, n: 80 },
            ],
          },
          {
            metric: "steps",
            metricLabel: "Steps",
            points: [
              { lag: 0, r: null, n: 4 },
              { lag: 1, r: null, n: 4 },
            ],
          },
        ])}
      />,
    );
    expect(screen.getByText("Effect Timing")).toBeInTheDocument();
    expect(screen.getByText(/points to a delayed effect/i)).toBeInTheDocument();
  });

  it("shows the not-enough-data state when every point is null", () => {
    render(
      <LagCurve
        data={profile([
          {
            metric: "sleepMin",
            metricLabel: "Sleep (min)",
            points: [
              { lag: 0, r: null, n: 3 },
              { lag: 1, r: null, n: 3 },
            ],
          },
        ])}
      />,
    );
    expect(
      screen.getByText(/Not enough varying-dose history/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Effect Timing")).not.toBeInTheDocument();
  });
});
