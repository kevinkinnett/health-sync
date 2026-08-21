import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  RecoveryEffectCoverage,
  RecoveryEffectEstimate,
  RecoveryEffectsData,
} from "@health-dashboard/shared";
import { RecoveryEffects } from "../components/RecoveryEffects";

const coverage = (over: Partial<RecoveryEffectCoverage> = {}): RecoveryEffectCoverage => ({
  activityId: 1,
  activityCode: "hot_blanket",
  activityName: "Hot blanket",
  sessions: 14,
  alignedSessions: 12,
  combinedExposures: 2,
  matchedPairs: 11,
  requiredPairs: 10,
  ...over,
});

const effect = (over: Partial<RecoveryEffectEstimate> = {}): RecoveryEffectEstimate => ({
  activityId: 1,
  activityCode: "hot_blanket",
  activityName: "Hot blanket",
  outcome: "sleep_duration",
  outcomeLabel: "Sleep duration",
  unit: "min",
  betterDirection: "up",
  exposedPeriods: 11,
  matchedControlPeriods: 11,
  exposedMean: 445,
  controlMean: 425,
  adjustedDifference: 20,
  confidenceInterval: { low: 4, high: 35 },
  standardizedDifference: 0.3,
  conclusion: "helped",
  confidence: "limited",
  evidence: "adjusted_association",
  interpretation: "Hot blanket sessions were followed by 20 minutes more sleep than matched nights.",
  ...over,
});

const data = (
  coverageItems: RecoveryEffectCoverage[],
  effects: RecoveryEffectEstimate[],
): RecoveryEffectsData => ({
  methodVersion: "recovery-effects-v1-matched-sleep-periods",
  timezone: "America/New_York",
  window: { start: "2025-01-01", end: "2026-08-20" },
  coverage: coverageItems,
  effects,
  matching: {
    weekdayMatched: true,
    maximumDayDistance: 84,
    maximumSessionToSleepHours: 24,
    minimumMatchedPairs: 10,
    covariates: [],
  },
  caveats: ["Adjusted association only."],
});

describe("RecoveryEffects", () => {
  it("shows coverage, timing, uncertainty, samples, and non-causal wording", () => {
    render(<RecoveryEffects data={data([coverage()], [effect()])} />);
    expect(screen.getByText(/first main sleep that begins after it ends, within 24 hours/i)).toBeInTheDocument();
    expect(screen.getByText("+20.0 min")).toBeInTheDocument();
    expect(screen.getByText("+4.0 to +35.0 min")).toBeInTheDocument();
    expect(screen.getByText("limited · n=11")).toBeInTheDocument();
    expect(screen.getByText(/adjusted personal associations, not proof of causation/i)).toBeInTheDocument();
    expect(screen.getByText(/2 combined-exposure nights/i)).toBeInTheDocument();
  });

  it("switches activities and shows collection progress below the evidence floor", () => {
    render(<RecoveryEffects data={data(
      [coverage(), coverage({ activityId: 2, activityCode: "massage", activityName: "Massage", sessions: 4, alignedSessions: 4, combinedExposures: 0, matchedPairs: 3 })],
      [effect()],
    )} />);
    fireEvent.click(screen.getByRole("tab", { name: "Massage" }));
    expect(screen.getByText("3/10 matched pairs")).toBeInTheDocument();
    expect(screen.getByText(/3 of 10 matched pairs are available/i)).toBeInTheDocument();
    expect(screen.queryByText("+20.0 min")).not.toBeInTheDocument();
  });

  it("has a responsive empty state before the first session", () => {
    render(<RecoveryEffects data={data([], [])} />);
    expect(screen.getByText(/Log a Hot blanket or Massage session/i)).toBeInTheDocument();
  });
});
