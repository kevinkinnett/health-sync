import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  RecoveryEffectCoverage,
  RecoveryEffectEstimate,
  RecoveryEffectsData,
  RecoveryEffectOutcome,
  RecoveryEventStudyData,
} from "@health-dashboard/shared";
import { RecoveryEffects } from "../components/RecoveryEffects";
import { useRecoveryEventStudy } from "../api/queries";

vi.mock("../api/queries", () => ({ useRecoveryEventStudy: vi.fn() }));

const mockedEventStudy = vi.mocked(useRecoveryEventStudy);

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

const eventStudy = (
  over: Partial<RecoveryEventStudyData> = {},
  outcome: RecoveryEffectOutcome = "sleep_duration",
): RecoveryEventStudyData => ({
  methodVersion: "recovery-event-study-v1-descriptive-windows",
  timezone: "America/New_York",
  window: { start: "2025-01-01", end: "2026-08-20" },
  activityId: 1,
  activityCode: "hot_blanket",
  activityName: "Hot blanket",
  outcome,
  outcomeLabel: outcome === "hrv" ? "Wake-day HRV" : "Sleep duration",
  unit: outcome === "hrv" ? "ms" : "min",
  betterDirection: "up",
  evidenceState: "individual",
  totalEvents: 1,
  eligibleEvents: 1,
  matchedPairs: 1,
  requiredMatchedPairs: 10,
  totalTrajectories: 1,
  displayedTrajectories: 1,
  offsets: [-1, 0, 1],
  trajectories: [{
    anchorDate: "2026-08-15",
    sessionIds: [1],
    startedAts: ["2026-08-15T01:00:00.000Z"],
    totalDurationMinutes: 25,
    sessionToSleepMinutes: 120,
    durationGroup: "short",
    combinedExposure: false,
    eligible: true,
    points: [
      { date: "2026-08-14", offsetDays: -1, actual: null, expectedCenter: 420, expectedRange: { low: 400, high: 440 }, delta: null, controlCount: 8, recoveryExposures: [], excludedFromAggregate: false },
      { date: "2026-08-15", offsetDays: 0, actual: 450, expectedCenter: 425, expectedRange: { low: 405, high: 445 }, delta: 25, controlCount: 8, recoveryExposures: ["Hot blanket"], excludedFromAggregate: false },
      { date: "2026-08-16", offsetDays: 1, actual: null, expectedCenter: 422, expectedRange: { low: 402, high: 442 }, delta: null, controlCount: 7, recoveryExposures: ["Massage"], excludedFromAggregate: true },
    ],
  }],
  aggregate: [],
  durationResponses: Array.from({ length: 8 }, (_, offsetDays) => ({
    offsetDays,
    state: "insufficient_events" as const,
    eligibleEvents: offsetDays === 0 ? 1 : 0,
    distinctDurations: offsetDays === 0 ? 1 : 0,
    durationRangeMinutes: 0,
    slopePer10Minutes: null,
    slopeConfidenceInterval: null,
    rankCorrelation: null,
  })),
  timingResponses: Array.from({ length: 8 }, (_, offsetDays) => ({
    offsetDays,
    state: "insufficient_events" as const,
    eligibleEvents: offsetDays === 0 ? 1 : 0,
    distinctTimings: offsetDays === 0 ? 1 : 0,
    timingRangeMinutes: 0,
    slopePer60Minutes: null,
    slopeConfidenceInterval: null,
    rankCorrelation: null,
  })),
  matchedEstimate: null,
  caveats: ["Descriptive only."],
  ...over,
});

beforeEach(() => {
  mockedEventStudy.mockImplementation((_activityId, outcome) => ({
    data: eventStudy({}, outcome),
    isLoading: false,
    isError: false,
    error: null,
  }) as ReturnType<typeof useRecoveryEventStudy>);
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

  it("shows an accessible individual timeline without an effect conclusion", () => {
    render(<RecoveryEffects data={data([coverage({ matchedPairs: 1 })], [])} />);
    expect(screen.getByText("Individual observation")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /sleep duration around hot blanket sessions/i })).toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.getAllByRole("table").every((table) => table.parentElement?.classList.contains("overflow-x-auto"))).toBe(true);
    expect(screen.getAllByText("25 min").length).toBeGreaterThan(0);
    expect(screen.getByText("120 min")).toBeInTheDocument();
    expect(screen.getByText(/1 of 10 comparable, uncontaminated events/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Exposure factor"), { target: { value: "timing" } });
    expect(screen.getByText(/Individual points are shown without a timing trend/i)).toBeInTheDocument();
    expect(screen.getByText("Missing measurement")).toBeInTheDocument();
    expect(screen.getByText(/Massage; excluded from summary/)).toBeInTheDocument();
    expect(screen.queryByText("Likely benefit")).not.toBeInTheDocument();
    expect(screen.queryByText("Possible cost")).not.toBeInTheDocument();
    expect(screen.queryByText("Still unclear")).not.toBeInTheDocument();
  });

  it("switches outcomes and displays provisional repeated-event language", () => {
    mockedEventStudy.mockImplementation((_activityId, outcome) => ({
      data: eventStudy({
        evidenceState: "provisional",
        eligibleEvents: 3,
        totalEvents: 3,
        aggregate: [{ offsetDays: 0, sampleCount: 3, medianDelta: 4, observedRange: { low: -1, high: 8 } }],
      }, outcome),
      isLoading: false,
      isError: false,
      error: null,
    }) as ReturnType<typeof useRecoveryEventStudy>);
    render(<RecoveryEffects data={data([coverage({ matchedPairs: 3 })], [])} />);
    fireEvent.change(screen.getByLabelText("Recovery outcome"), { target: { value: "hrv" } });
    expect(mockedEventStudy).toHaveBeenLastCalledWith(1, "hrv");
    expect(screen.getByText("Provisional repeated pattern")).toBeInTheDocument();
    expect(screen.getByText("+4 ms")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Exposure response offset"), { target: { value: "1" } });
    expect(screen.getByText(/0 of 10 comparable, uncontaminated events/i)).toBeInTheDocument();
  });

  it("shows short and long duration observations and an available robust trend", () => {
    const base = eventStudy();
    const longTrajectory = {
      ...base.trajectories[0],
      anchorDate: "2026-07-15",
      sessionIds: [2],
      startedAts: ["2026-07-15T01:00:00.000Z"],
      totalDurationMinutes: 60,
      sessionToSleepMinutes: 45,
      durationGroup: "long" as const,
      points: base.trajectories[0].points.map((point) => ({ ...point, date: point.date.replace("08", "07") })),
    };
    mockedEventStudy.mockReturnValue({
      data: eventStudy({
        totalEvents: 10,
        eligibleEvents: 10,
        totalTrajectories: 10,
        displayedTrajectories: 2,
        trajectories: [base.trajectories[0], longTrajectory],
        durationResponses: base.durationResponses.map((response) => response.offsetDays === 0 ? {
          ...response,
          state: "available" as const,
          eligibleEvents: 10,
          distinctDurations: 6,
          durationRangeMinutes: 45,
          slopePer10Minutes: 2.5,
          slopeConfidenceInterval: { low: 0.5, high: 4.5 },
          rankCorrelation: 0.62,
        } : response),
      }),
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useRecoveryEventStudy>);

    render(<RecoveryEffects data={data([coverage({ matchedPairs: 9 })], [])} />);

    expect(screen.getByRole("option", { name: /25 min/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /60 min/i })).toBeInTheDocument();
    expect(screen.getAllByText("short", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("long", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText("+2.50 min")).toBeInTheDocument();
    expect(screen.getByText("+0.50 to +4.50 min")).toBeInTheDocument();
    expect(screen.getByText("0.62 · n=10")).toBeInTheDocument();
    expect(screen.getByText(/association, not evidence that changing session length caused the outcome/i)).toBeInTheDocument();
  });

  it("switches to a separate time-before-sleep trend with its own threshold and scale", () => {
    const base = eventStudy();
    mockedEventStudy.mockReturnValue({
      data: eventStudy({
        totalEvents: 10,
        eligibleEvents: 10,
        timingResponses: base.timingResponses.map((response) => response.offsetDays === 0 ? {
          ...response,
          state: "available" as const,
          eligibleEvents: 10,
          distinctTimings: 8,
          timingRangeMinutes: 240,
          slopePer60Minutes: -3.25,
          slopeConfidenceInterval: { low: -5.5, high: -1 },
          rankCorrelation: -0.58,
        } : response),
      }),
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useRecoveryEventStudy>);

    render(<RecoveryEffects data={data([coverage({ matchedPairs: 9 })], [])} />);
    fireEvent.change(screen.getByLabelText("Exposure factor"), { target: { value: "timing" } });

    expect(screen.getByText(/Does time before sleep track with the outcome/i)).toBeInTheDocument();
    expect(screen.getByText("-3.25 min")).toBeInTheDocument();
    expect(screen.getByText("-5.50 to -1.00 min")).toBeInTheDocument();
    expect(screen.getByText("-0.58 · n=10")).toBeInTheDocument();
    expect(screen.getByText(/Duration and timing may correlate; neither estimate controls for the other/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Exposure response offset"), { target: { value: "1" } });
    expect(screen.getByText(/0 of 10 comparable, uncontaminated events/i)).toBeInTheDocument();
  });

  it("keeps the mature matched estimate alongside the event timeline", () => {
    mockedEventStudy.mockReturnValue({
      data: eventStudy({ evidenceState: "matched", matchedPairs: 11, matchedEstimate: effect() }),
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useRecoveryEventStudy>);
    render(<RecoveryEffects data={data([coverage()], [effect()])} />);
    expect(screen.getByText("Matched estimate available")).toBeInTheDocument();
    expect(screen.getByText("Likely benefit")).toBeInTheDocument();
    expect(screen.getByText("+20.0 min")).toBeInTheDocument();
  });
});
