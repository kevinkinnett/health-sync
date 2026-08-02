import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LagProfile } from "@health-dashboard/shared";
import { LagCurve } from "../components/charts/LagCurve";

/**
 * Observable Plot is NOT mocked here, unlike every Recharts chart in this
 * suite — because it doesn't need to be.
 *
 * Plot takes an explicit width and builds SVG with d3, so it renders fully
 * under jsdom: a 30-point line comes out as a path with ~440 characters of
 * real geometry. Recharts measures the DOM to decide whether to draw at
 * all, and jsdom always answers zero, so it emits nothing and every
 * assertion about it is vacuous.
 *
 * This file used to stub Plot out with `() => document.createElement("div")`,
 * which threw away the one charting library in the stack that can actually
 * be tested. The assertions below are what that bought back.
 */
const geometry = (c: HTMLElement) =>
  [...c.querySelectorAll("path[d]")].map((p) => (p.getAttribute("d") ?? "").length);


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

  it("actually draws the lag curve, not just the card around it", () => {
    // The assertion the mock made impossible. A chart that silently stops
    // rendering leaves every heading and caption in place — which is
    // exactly how the HRV chart lost a whole series for seven weeks.
    const { container } = render(
      <LagCurve
        data={profile([
          {
            metric: "sleepMin",
            metricLabel: "Sleep (min)",
            points: Array.from({ length: 8 }, (_, lag) => ({
              lag,
              r: Math.cos(lag / 2) * 0.4,
              n: 80,
            })),
          },
        ])}
      />,
    );

    expect(container.querySelector("svg")).toBeTruthy();
    // A real multi-point line is a long path; an axis tick is ~9 chars.
    expect(Math.max(...geometry(container))).toBeGreaterThan(50);
  });

  it("labels the plot for a screen reader", () => {
    // Plot emits aria-label on its marks natively. Worth pinning: it is
    // one of the reasons to prefer it, and a silent regression here would
    // otherwise never surface.
    const { container } = render(
      <LagCurve
        data={profile([
          {
            metric: "sleepMin",
            metricLabel: "Sleep (min)",
            points: [
              { lag: 0, r: -0.18, n: 80 },
              { lag: 1, r: -0.47, n: 80 },
            ],
          },
        ])}
      />,
    );
    expect(container.querySelectorAll("[aria-label]").length).toBeGreaterThan(0);
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
