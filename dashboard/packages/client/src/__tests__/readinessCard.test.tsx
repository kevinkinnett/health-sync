import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadinessCard } from "../components/ReadinessCard";
import type { ReadinessScore } from "@health-dashboard/shared";

function makeScore(over: Partial<ReadinessScore> = {}): ReadinessScore {
  return {
    date: "2026-05-28",
    score: 72,
    band: "primed",
    summary: "Primed — hrv above your baseline.",
    baselineDays: 30,
    components: [
      { metric: "hrv", label: "HRV", value: 65, baseline: 50, z: 1.4, contribution: 12, weightPct: 35, status: "good" },
      { metric: "rhr", label: "Resting HR", value: 53, baseline: 60, z: 0.9, contribution: 6, weightPct: 25, status: "good" },
      { metric: "breathing", label: "Breathing rate", value: 18, baseline: 14, z: -1.1, contribution: -4, weightPct: 10, status: "poor" },
      { metric: "spo2", label: "Blood oxygen", value: 96, baseline: 96, z: 0.1, contribution: 0, weightPct: 8, status: "neutral" },
    ],
    history: [
      { date: "2026-05-26", score: 60 },
      { date: "2026-05-27", score: 68 },
      { date: "2026-05-28", score: 72 },
    ],
    ...over,
  };
}

describe("ReadinessCard", () => {
  it("renders the score, band, and summary", () => {
    render(<ReadinessCard data={makeScore()} />);
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("Primed")).toBeInTheDocument();
    expect(screen.getByText(/above your baseline/i)).toBeInTheDocument();
    // Accessible label on the dial
    expect(
      screen.getByRole("img", { name: /readiness score 72 of 100/i }),
    ).toBeInTheDocument();
  });

  it("surfaces only the good/poor drivers as chips, strongest first", () => {
    render(<ReadinessCard data={makeScore()} />);
    // HRV (good) and Breathing (poor) are drivers; SpO2 (neutral) is not.
    expect(screen.getByText("HRV")).toBeInTheDocument();
    expect(screen.getByText("Resting HR")).toBeInTheDocument();
    expect(screen.getByText("Breathing rate")).toBeInTheDocument();
    expect(screen.queryByText("Blood oxygen")).not.toBeInTheDocument();
  });

  it("renders a friendly message and no score when insufficient", () => {
    render(
      <ReadinessCard
        data={makeScore({
          score: null,
          band: "insufficient",
          summary: "Not enough baseline history yet — keep syncing.",
          components: [],
          history: [],
        })}
      />,
    );
    expect(screen.queryByText("72")).not.toBeInTheDocument();
    expect(screen.getByText(/keep syncing/i)).toBeInTheDocument();
  });

  it("shows the compromised band styling/label when run-down", () => {
    render(
      <ReadinessCard
        data={makeScore({ score: 31, band: "compromised", summary: "Compromised — rhr below." })}
      />,
    );
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("Compromised")).toBeInTheDocument();
  });
});
