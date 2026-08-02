import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SparklineData } from "@health-dashboard/shared";
import { StatCard } from "../components/StatCard";
import { Sparkbars } from "../components/Sparkbars";
import { statBadge } from "../components/statBadge";

const series = (...values: number[]): SparklineData[] =>
  values.map((value, i) => ({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, value }));

/** Steady at ~100, then today. */
const steadyThen = (today: number) => series(100, 98, 102, 99, 101, today);

describe("statBadge", () => {
  it("says steady when today sits inside the usual spread", () => {
    expect(statBadge(steadyThen(100), "up")).toMatchObject({
      label: "steady",
      tone: "neutral",
    });
  });

  it("calls a rise better when up is the good direction", () => {
    expect(statBadge(steadyThen(140), "up")).toMatchObject({
      label: "above usual",
      tone: "good",
    });
  });

  it("calls the SAME rise worse when down is the good direction", () => {
    // Resting HR going up is not an achievement. This is the whole reason
    // the caller has to declare a direction.
    expect(statBadge(steadyThen(140), "down")).toMatchObject({
      label: "above usual",
      tone: "bad",
    });
  });

  it("scales by the metric's own spread, not by a percentage", () => {
    // The same +6% move: noise on a jumpy series, notable on a stable one.
    // No single percentage threshold could get both of these right, which
    // is why the rule is in SDs.
    const jumpy = series(60, 140, 70, 130, 80, 106);
    const stable = series(100, 100, 101, 99, 100, 106);
    expect(statBadge(jumpy, "up")?.label).toBe("steady");
    expect(statBadge(stable, "up")?.label).toBe("above usual");
  });

  it("returns nothing when there is too little history to judge spread", () => {
    expect(statBadge(series(100, 120), "up")).toBeNull();
  });

  it("treats a perfectly flat series as steady rather than infinitely significant", () => {
    // sd 0 would make any deviation divide by zero.
    expect(statBadge(series(100, 100, 100, 100, 101), "up")).toMatchObject({
      label: "steady",
    });
  });

  it("ignores null readings rather than scoring them as zero", () => {
    const withGaps = [
      ...series(100, 98, 102, 99),
      { date: "2026-07-05", value: null as unknown as number },
      { date: "2026-07-06", value: 140 },
    ];
    expect(statBadge(withGaps, "up")?.tone).toBe("good");
  });
});

describe("Sparkbars", () => {
  it("draws one bar per reading", () => {
    const { container } = render(<Sparkbars data={series(1, 2, 3, 4)} color="#3987e5" />);
    expect(container.querySelectorAll("rect")).toHaveLength(4);
  });

  it("gives every bar a positive height, including the minimum", () => {
    // A zero-height bar is an invisible day. This is assertable at all
    // only because the sparkline is plain SVG — the Recharts version it
    // replaces rendered nothing whatsoever under jsdom.
    const { container } = render(<Sparkbars data={series(0, 50, 100)} color="#3987e5" />);
    const heights = [...container.querySelectorAll("rect")].map((r) =>
      Number(r.getAttribute("height")),
    );
    expect(Math.min(...heights)).toBeGreaterThan(0);
  });

  it("varies bar height for a series that never approaches zero", () => {
    // Resting HR 64-67 anchored at zero would be four identical bars and
    // no visible trend.
    const { container } = render(<Sparkbars data={series(64, 65, 66, 67)} color="#3987e5" />);
    const heights = [...container.querySelectorAll("rect")].map((r) =>
      Number(r.getAttribute("height")),
    );
    expect(new Set(heights).size).toBeGreaterThan(1);
  });

  it("renders nothing when there is no data", () => {
    const { container } = render(<Sparkbars data={[]} color="#3987e5" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("StatCard", () => {
  it("shows the derived verdict in words", () => {
    render(
      <StatCard
        title="Resting HR"
        value={65}
        unit="bpm"
        sparkline={steadyThen(140)}
        betterDirection="down"
      />,
    );
    expect(screen.getByTestId("stat-badge")).toHaveTextContent("above usual");
  });

  it("stays a bare number when the app has no opinion on direction", () => {
    // Body mass: the dashboard should not imply which way it ought to go.
    render(<StatCard title="Body Mass" value={176.8} sparkline={steadyThen(190)} />);
    expect(screen.queryByTestId("stat-badge")).not.toBeInTheDocument();
  });

  it("lets an explicit badge win over the derived one", () => {
    render(
      <StatCard
        title="Total Steps"
        value={8432}
        sparkline={steadyThen(140)}
        betterDirection="up"
        badge="PR"
      />,
    );
    expect(screen.getByText("PR")).toBeInTheDocument();
    expect(screen.queryByTestId("stat-badge")).not.toBeInTheDocument();
  });

  it("still renders the number when there is no sparkline at all", () => {
    render(<StatCard title="Total Steps" value={8432} sparkline={[]} betterDirection="up" />);
    expect(screen.getByText("8432")).toBeInTheDocument();
  });
});
