import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ActivityDay } from "@health-dashboard/shared";
import { ActivityChart } from "../components/charts/ActivityChart";
import { METRIC_COLOR } from "../components/charts/chartPalette";

/*
 * Record the props every <Area> is rendered with, then render the real one.
 *
 * jsdom draws no series geometry (see setup.ts), so the painted colour can't
 * be read off the DOM here. What CAN be checked is what the component hands
 * the chart library — which is exactly where the shared-colour bug lived.
 */
const areas = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  const RealArea = actual.Area;
  function RecordingArea(props: React.ComponentProps<typeof RealArea>) {
    areas.push(props as unknown as Record<string, unknown>);
    return <RealArea {...props} />;
  }
  return { ...actual, Area: RecordingArea };
});

beforeEach(() => {
  areas.length = 0;
});

/** The last props each series was rendered with, keyed by dataKey. */
function areaProps(): Map<unknown, Record<string, unknown>> {
  return new Map(areas.map((p) => [p.dataKey, p]));
}

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

  it("paints steps and active minutes in their own, different colours", () => {
    // The regression this locks: BOTH series were painted
    // METRIC_COLOR.steps, so two unrelated measures were the same blue.
    // Asserted on what the chart is actually given — comparing the palette
    // constants alone stayed green with that exact bug reintroduced.
    render(<ActivityChart data={DATA} />);
    const byKey = areaProps();
    const steps = byKey.get("steps");
    const active = byKey.get("activeMinutes");
    expect(steps, "no steps series rendered").toBeDefined();
    expect(active, "no active-minutes series rendered").toBeDefined();

    expect(steps).toMatchObject({ stroke: METRIC_COLOR.steps, fill: METRIC_COLOR.steps });
    expect(active).toMatchObject({
      stroke: METRIC_COLOR.activeMinutes,
      fill: METRIC_COLOR.activeMinutes,
    });
    expect(active!.stroke).not.toBe(steps!.stroke);
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
