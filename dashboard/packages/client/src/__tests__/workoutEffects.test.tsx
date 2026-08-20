import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { WorkoutEffectEstimate, WorkoutEffectsData } from "@health-dashboard/shared";
import { WorkoutEffects } from "../components/WorkoutEffects";

function effect(over: Partial<WorkoutEffectEstimate> = {}): WorkoutEffectEstimate {
  return {
    exposure: "all",
    exposureLabel: "Any workout",
    outcome: "sleep_duration",
    outcomeLabel: "Sleep that night",
    unit: "min",
    betterDirection: "up",
    workoutDays: 24,
    matchedRestDays: 24,
    workoutMean: 440,
    matchedRestMean: 420,
    adjustedDifference: 20,
    confidenceInterval: { low: 5, high: 34 },
    standardizedDifference: 0.3,
    conclusion: "helped",
    confidence: "moderate",
    evidence: "adjusted_association",
    interpretation: "Workout days were followed by 20 minutes more sleep than matched rest days.",
    ...over,
  };
}

function data(effects: WorkoutEffectEstimate[]): WorkoutEffectsData {
  return {
    methodVersion: "workout-effects-v1-matched-days",
    timezone: "America/New_York",
    window: { start: "2026-01-01", end: "2026-08-11" },
    sessions: 40,
    workoutDays: 32,
    effects,
    matching: { weekdayMatched: true, maximumDayDistance: 84, covariates: [] },
    caveats: ["Adjusted association only."],
  };
}

describe("WorkoutEffects", () => {
  const renderEffects = (effects: WorkoutEffectEstimate[]) => render(
    <MemoryRouter>
      <WorkoutEffects data={data(effects)} />
    </MemoryRouter>,
  );

  it("shows real-unit effect, uncertainty, and an explicit evidence grade", () => {
    renderEffects([effect()]);
    expect(screen.getByText("+20.0 min")).toBeInTheDocument();
    expect(screen.getByText("+5.0 to +34.0 min")).toBeInTheDocument();
    expect(screen.getByText("Adjusted association")).toBeInTheDocument();
    expect(screen.getByText("moderate · n=24")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review training-program changes/ })).toHaveAttribute(
      "href",
      "/timeline?category=training",
    );
  });

  it("switches exercise types without mixing their estimates", () => {
    renderEffects([
      effect(),
      effect({
        exposure: "strength",
        exposureLabel: "Strength",
        adjustedDifference: -3,
        confidenceInterval: { low: -8, high: 2 },
        conclusion: "unclear",
        interpretation: "Strength remains unclear.",
      }),
    ]);
    fireEvent.click(screen.getByRole("tab", { name: "Strength" }));
    expect(screen.getByText("-3.0 min")).toBeInTheDocument();
    expect(screen.getByText("Strength remains unclear.")).toBeInTheDocument();
    expect(screen.queryByText("+20.0 min")).not.toBeInTheDocument();
  });

  it("explains the evidence floor when there are no estimates", () => {
    renderEffects([]);
    expect(screen.getByText(/At least 10 comparable workout and rest days/)).toBeInTheDocument();
  });
});
