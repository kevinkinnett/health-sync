import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReadinessScore, ReadinessComponent } from "@health-dashboard/shared";
import { ReadinessWaterfall } from "../components/charts/ReadinessWaterfall";

function comp(
  metric: ReadinessComponent["metric"],
  label: string,
  z: number | null,
  contribution: number,
): ReadinessComponent {
  return {
    metric,
    label,
    value: 1,
    baseline: 1,
    z,
    contribution,
    weightPct: 20,
    status: z == null ? "unavailable" : z >= 0 ? "good" : "poor",
  };
}

function score(over: Partial<ReadinessScore> = {}): ReadinessScore {
  return {
    date: "2026-06-13",
    score: 59,
    band: "balanced",
    summary: "",
    baselineDays: 30,
    history: [],
    // Realistic shape: raw contributions sum to +14 (linear term) while the
    // tanh-compressed score offset is +9 — same sign, so the rescale (k≈0.64)
    // shrinks magnitudes without flipping any signal's direction.
    components: [
      comp("hrv", "HRV", 0.9, 16), // lift, biggest mover
      comp("sleep", "Sleep", -0.6, -8), // only drag
      comp("rhr", "Resting HR", 0.3, 6), // smaller lift
      comp("spo2", "Blood oxygen", null, 0), // unavailable — excluded
    ],
    ...over,
  };
}

describe("ReadinessWaterfall", () => {
  it("names the biggest drag and biggest lift as the actionable headline", () => {
    render(<ReadinessWaterfall data={score()} />);
    expect(screen.getByText(/Biggest drag: Sleep/)).toBeInTheDocument();
    expect(screen.getByText(/Biggest lift: HRV/)).toBeInTheDocument();
  });

  it("renders one row per scored signal, biggest impact first, excluding unavailable", () => {
    render(<ReadinessWaterfall data={score()} />);
    const rows = screen.getAllByRole("listitem");
    // hrv, sleep, rhr scored; spo2 unavailable -> excluded.
    expect(rows).toHaveLength(3);
    // Ranked by |scaled points|: HRV (16→~10), Sleep (8→~5), RHR (6→~4).
    expect(rows[0]).toHaveTextContent("HRV");
    expect(rows[1]).toHaveTextContent("Sleep");
    expect(rows[2]).toHaveTextContent("Resting HR");
    // No blood-oxygen row.
    expect(screen.queryByText("Blood oxygen")).not.toBeInTheDocument();
  });

  it("shows the final score on the Today row", () => {
    render(<ReadinessWaterfall data={score()} />);
    // The 'Today' total row carries the displayed score.
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("59")).toBeInTheDocument();
  });

  it("rescales contributions so the labeled points sum to (score − 50)", () => {
    // raw contributions sum to -2 but score-50 = +9 here; after the
    // proportional rescale the signed points must total +9 (±rounding).
    render(<ReadinessWaterfall data={score({ score: 59 })} />);
    const rows = screen.getAllByRole("listitem");
    const pts = rows.map((r) => {
      const m = within(r).getByText(/[+−]\d+ pt/).textContent!;
      const n = parseInt(m.replace("−", "-").replace("+", ""), 10);
      return n;
    });
    const total = pts.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(8);
    expect(total).toBeLessThanOrEqual(10);
  });

  it("renders nothing when the score is null (insufficient data)", () => {
    const { container } = render(
      <ReadinessWaterfall data={score({ score: null, band: "insufficient" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no signal has a contribution", () => {
    const { container } = render(
      <ReadinessWaterfall
        data={score({ components: [comp("hrv", "HRV", null, 0)] })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
