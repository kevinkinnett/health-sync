import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { MetricSeries } from "@health-dashboard/shared";
import { MetricSeriesPanels } from "../components/interventions/MetricSeriesPanels";

/**
 * These assertions are possible because the panels are built with
 * Observable Plot, which renders real SVG under jsdom. The equivalent
 * Recharts component would emit nothing here and every check below would
 * be vacuous — which is the whole reason Plot is the default for new
 * charts.
 */

function seriesFor(
  over: Partial<MetricSeries> = {},
  days = 8,
): MetricSeries {
  const start = Date.parse("2026-04-28T00:00:00Z");
  return {
    metric: "sleepMin",
    label: "Time asleep",
    unit: "min",
    betterDirection: "up",
    points: Array.from({ length: days }, (_, i) => ({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      value: i < days / 2 ? 390 + (i % 3) * 6 : 435 + (i % 3) * 6,
    })),
    beforeMean: 391.9,
    afterMean: 435.4,
    meaningful: true,
    ...over,
  };
}

const CHANGEPOINT = "2026-05-02";

const geometry = (c: HTMLElement) =>
  [...c.querySelectorAll("path[d]")].map((p) => (p.getAttribute("d") ?? "").length);

describe("MetricSeriesPanels", () => {
  it("draws a real line per metric, not just a labelled box", () => {
    const { container } = render(
      <MetricSeriesPanels series={[seriesFor()]} changepoint={CHANGEPOINT} />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
    // An axis tick path is ~9 chars; an 8-point line is far longer.
    expect(Math.max(...geometry(container))).toBeGreaterThan(50);
  });

  it("labels each panel with its metric and the two window means", () => {
    render(<MetricSeriesPanels series={[seriesFor()]} changepoint={CHANGEPOINT} />);
    expect(screen.getByText("Time asleep")).toBeInTheDocument();
    expect(screen.getByText("391.9 → 435.4 min")).toBeInTheDocument();
  });

  it("gives every metric its own panel, since the units differ", () => {
    // A shared y-scale across minutes, bpm and percent would be
    // meaningless — that is why these are small multiples.
    const { container } = render(
      <MetricSeriesPanels
        series={[
          seriesFor(),
          seriesFor({ metric: "restingHr", label: "Resting heart rate", unit: "bpm" }),
        ]}
        changepoint={CHANGEPOINT}
      />,
    );
    expect(container.querySelectorAll("svg").length).toBe(2);
  });

  it("leads with the metric that moved most, not registry order", () => {
    // `series` arrives in metric-registry order, which is a storage
    // concern. The reader wants the biggest mover first.
    render(
      <MetricSeriesPanels
        series={[
          seriesFor({ metric: "restingHr", label: "Barely moved", beforeMean: 67, afterMean: 66.8 }),
          seriesFor({ metric: "sleepMin", label: "Moved a lot", beforeMean: 392, afterMean: 435 }),
        ]}
        changepoint={CHANGEPOINT}
      />,
    );
    const labels = screen.getAllByText(/Moved a lot|Barely moved/);
    expect(labels[0]).toHaveTextContent("Moved a lot");
  });

  it("caps the panel count rather than growing without bound", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      seriesFor({ metric: `m${i}`, label: `Metric ${i}` }),
    );
    const { container } = render(
      <MetricSeriesPanels series={many} changepoint={CHANGEPOINT} />,
    );
    expect(container.querySelectorAll("svg").length).toBe(6);
  });

  it("does not colour a level line the report calls noise", () => {
    // Resting HR moving 67 → 66.8 is graded not-meaningful. A green
    // "after" line there would claim an improvement the rest of the
    // report deliberately withholds.
    const { container } = render(
      <MetricSeriesPanels
        series={[
          seriesFor({
            metric: "restingHr",
            betterDirection: "down",
            beforeMean: 67,
            afterMean: 66.8,
            meaningful: false,
          }),
        ]}
        changepoint={CHANGEPOINT}
      />,
    );
    const strokes = [...container.querySelectorAll("[stroke]")].map((n) =>
      (n.getAttribute("stroke") ?? "").toLowerCase(),
    );
    expect(strokes).not.toContain("#0ca30c"); // STATUS.good
  });

  it("colours it when the change IS a result", () => {
    const { container } = render(
      <MetricSeriesPanels series={[seriesFor({ meaningful: true })]} changepoint={CHANGEPOINT} />,
    );
    const strokes = [...container.querySelectorAll("[stroke]")].map((n) =>
      (n.getAttribute("stroke") ?? "").toLowerCase(),
    );
    expect(strokes).toContain("#0ca30c");
  });

  it("renders nothing when there is no series to plot", () => {
    const { container } = render(
      <MetricSeriesPanels series={[]} changepoint={CHANGEPOINT} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("explains how to read the marks", () => {
    // The panels are only useful if the reader knows a slope that starts
    // before the line is not an effect.
    render(<MetricSeriesPanels series={[seriesFor()]} changepoint={CHANGEPOINT} />);
    expect(screen.getByText(/step at the line is an effect/i)).toBeInTheDocument();
  });
});
