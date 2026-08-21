import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CorrelationsData, CorrelationPair } from "@health-dashboard/shared";
import { WhatsMoving } from "../components/WhatsMoving";

function pair(over: Partial<CorrelationPair> & { n: number }): CorrelationPair {
  const { n, ...rest } = over;
  return {
    xMetric: "x",
    yMetric: "y",
    xLabel: "X",
    yLabel: "Y",
    correlation: 0.5,
    evidence: "exploratory_association",
    insight: "insight",
    points: Array.from({ length: n }, (_, i) => ({ x: i, y: i, date: `d${i}` })),
    ...rest,
  };
}

function data(pairs: CorrelationPair[]): CorrelationsData {
  return { pairs, activitySleepBuckets: [], dataPoints: 200 };
}

describe("WhatsMoving", () => {
  it("ranks qualifying pairs by signal strength (|r|·√n), strongest first", () => {
    render(
      <WhatsMoving
        data={data([
          pair({ xMetric: "a", xLabel: "Steps", yLabel: "Sleep", correlation: 0.3, n: 40 }),
          pair({ xMetric: "b", xLabel: "Car", yLabel: "RHR", correlation: 0.6, n: 90 }),
        ])}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // 0.6·√90 ≈ 5.7 beats 0.3·√40 ≈ 1.9 → Car↔RHR first.
    expect(rows[0]).toHaveTextContent("Car");
    expect(rows[1]).toHaveTextContent("Steps");
  });

  it("excludes weak (|r| < 0.2) and thinly-sampled (n < 12) pairs", () => {
    render(
      <WhatsMoving
        data={data([
          pair({ xLabel: "Weak", correlation: 0.1, n: 100 }), // |r| too low
          pair({ xLabel: "Thin", correlation: 0.9, n: 8 }), // n too low
          pair({ xLabel: "Multiple-test fluke", correlation: 0.8, n: 100, notableAfterCorrection: false }),
          pair({ xLabel: "Real", correlation: 0.4, n: 50 }), // qualifies
        ])}
      />,
    );
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Real");
  });

  it("tags lag-1 pairs as 'next day' and surfaces the server insight verbatim", () => {
    render(
      <WhatsMoving
        data={data([
          pair({
            xLabel: "Time in Car",
            yLabel: "Sleep",
            correlation: -0.35,
            n: 60,
            lagDays: 1,
            insight: "more time in car tends to go with less sleep that night",
          }),
        ])}
      />,
    );
    expect(screen.getByText("next day")).toBeInTheDocument();
    expect(
      screen.getByText(/more time in car tends to go with less sleep/),
    ).toBeInTheDocument();
  });

  it("shows an empty-state message when nothing clears the bar", () => {
    render(
      <WhatsMoving data={data([pair({ correlation: 0.05, n: 100 })])} />,
    );
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText(/Nothing stands out strongly yet/)).toBeInTheDocument();
  });

  it("collapses past the top 6 with an expand toggle", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      pair({ xMetric: `m${i}`, xLabel: `Metric ${i}`, correlation: 0.5, n: 30 + i }),
    );
    render(<WhatsMoving data={data(many)} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByRole("button", { name: /show 3 more/i })).toBeInTheDocument();
  });
});
