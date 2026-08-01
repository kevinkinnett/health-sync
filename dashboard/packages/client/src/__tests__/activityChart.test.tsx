import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ActivityDay } from "@health-dashboard/shared";
import { ActivityChart } from "../components/charts/ActivityChart";
import { METRIC_COLOR } from "../components/charts/chartPalette";

/**
 * The chart is presentational — annotations arrive as a prop — so it renders
 * in a bare `render()` with no query client. That is the payoff of keeping
 * the fetching in `useChartAnnotations` rather than in the chart.
 */
function day(date: string, steps: number, fairly = 0, very = 0): ActivityDay {
  return {
    date,
    steps,
    caloriesOut: 2200,
    caloriesBmr: null,
    activeCalories: null,
    distanceKm: steps / 1400,
    floors: 4,
    minutesSedentary: null,
    minutesLightlyActive: 120,
    minutesFairlyActive: fairly,
    minutesVeryActive: very,
    fetchedAt: `${date}T12:00:00.000Z`,
  };
}

const DATA = [
  day("2026-07-28", 5200, 10, 4),
  day("2026-07-29", 7100, 18, 9),
  day("2026-07-30", 3900, 5, 0),
];

describe("ActivityChart", () => {
  it("names both measures and their units", () => {
    // The old version had two unlabelled y-axes: steps on the left, minutes
    // on the right, with nothing saying which was which.
    render(<ActivityChart data={DATA} />);
    expect(screen.getByTestId("panel-Steps")).toHaveTextContent("per day");
    expect(screen.getByTestId("panel-Active minutes")).toHaveTextContent(
      "moderate + vigorous, per day",
    );
  });

  it("gives steps and active minutes different colours", () => {
    // The regression this replaces: BOTH series were painted
    // METRIC_COLOR.steps, so two unrelated measures were the same blue.
    expect(METRIC_COLOR.steps).not.toBe(METRIC_COLOR.activeMinutes);
  });

  it("names the average after the series it actually describes", () => {
    // It used to be legended as a bare "7-day avg" while wearing the
    // active-minutes colour — the one orange thing on a chart, labelled
    // ambiguously, describing the blue series.
    render(<ActivityChart data={DATA} />);
    expect(screen.getByText("Steps, 7-day avg")).toBeInTheDocument();
  });

  it("plots the two measures on separate scales, never one shared plot", () => {
    // Two Recharts wrappers means two panels. Collapsing back to one would
    // mean the dual-axis version returned.
    const { container } = render(<ActivityChart data={DATA} />);
    expect(container.querySelectorAll(".recharts-wrapper").length).toBe(2);
  });

  it("lists what the dashed verticals mean when there are any", () => {
    render(
      <ActivityChart
        data={DATA}
        annotations={[
          { date: "2026-07-29", label: "Creatine 5 g", color: "#908fa0" },
        ]}
      />,
    );
    expect(screen.getByTestId("activity-annotation-key")).toHaveTextContent(
      "Creatine 5 g",
    );
  });

  it("shows no annotation key when nothing is marked", () => {
    render(<ActivityChart data={DATA} />);
    expect(screen.queryByTestId("activity-annotation-key")).not.toBeInTheDocument();
  });
});
