import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { SensorAgreementData } from "@health-dashboard/shared";
import { AnalyticsSensors } from "../pages/analytics/Sensors";

const apiFetch = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const AGREEMENT: SensorAgreementData = {
  start: "2026-08-01",
  end: "2026-08-12",
  timezone: "America/New_York",
  dateSemantics: "local_wake_date",
  nights: [{
    date: "2026-08-10",
    fitbit: {
      sessionStart: "2026-08-10T03:00:00Z", sessionEnd: "2026-08-10T10:30:00Z",
      sleepDurationMin: 420, deepMin: 80, lightMin: 250, remMin: 90,
      wakeMin: 30, timeInBedMin: 450, napMin: 25, sleepRecords: 2,
      efficiency: 93, score: null, tossAndTurnCount: null, bedTempC: null,
      roomTempC: null, regime: "main_sleep_v2",
    },
    eightSleep: {
      sessionStart: "2026-08-10T03:45:00Z", sessionEnd: "2026-08-10T11:00:00Z",
      sleepDurationMin: 450, deepMin: 90, lightMin: 260, remMin: 100,
      wakeMin: null, timeInBedMin: null, napMin: null, sleepRecords: null,
      efficiency: null, score: 87, tossAndTurnCount: 8, bedTempC: 27.2,
      roomTempC: 20.5, regime: "eight_sleep_main_session_v1",
    },
  }],
  series: [{
    metric: "sleep",
    label: "Main sleep duration",
    unit: "min",
    measurementComparable: true,
    fitbitMeasurement: "Fitbit main-session sleep",
    eightSleepMeasurement: "Eight Sleep main-session sleep",
    fitbitRegimes: ["main_sleep_v2"],
    eightSleepRegime: "eight_sleep_main_session_v1",
    joinedDays: 8,
    correlation: 0.72,
    meanDifference: 12,
    meanAbsoluteDifference: 18,
    evidence: {
      level: "limited", analysisNights: 8, regimeCount: 1,
      correlationMinimumNights: 7, rollingWindowNights: 14,
      latestRollingCorrelation: 0.72,
      interpretation: "Directional agreement is preliminary and may move with more nights.",
    },
    points: [{
      date: "2026-08-10", fitbitRegime: "main_sleep_v2", fitbit: 420, eightSleep: 450, difference: 30,
      fitbitZ: -0.8, eightSleepZ: 0.5, trendGap: 1.3,
      trendAlignment: "divergent", divergencePattern: "isolated", rollingCorrelation: 0.72,
    }],
    largestDivergences: [{ date: "2026-08-10", absoluteDifference: 30, fitbit: 420, eightSleep: 450 }],
  }],
};

function renderSensors() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><AnalyticsSensors /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Sensor comparison detail", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/health/sensor-agreement")) return Promise.resolve(AGREEMENT);
      if (path.startsWith("/health/activity")) return Promise.resolve([{ date: "2026-08-09", steps: 7200, minutesFairlyActive: 20, minutesVeryActive: 10 }]);
      if (path.startsWith("/health/exercise-logs")) return Promise.resolve([]);
      if (path.startsWith("/medications/intakes")) return Promise.resolve([{ id: 1, itemId: 1, itemName: "Example medication", takenAt: "2026-08-10T01:00:00Z", amount: 1, unit: "tablet", notes: null, createdAt: "" }]);
      if (path.startsWith("/supplements/intakes")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
  });

  it("opens an accessible night detail with UTC/Eastern sessions and nearby context", async () => {
    renderSensors();
    expect(await screen.findByRole("combobox", { name: /Wake date/i })).toBeInTheDocument();
    const gapButton = await screen.findByRole("button", { name: /2026-08-10.*gap 30.0 min/i });
    fireEvent.click(gapButton);

    expect(await screen.findByRole("dialog", { name: /Wake date Aug 10, 2026/i })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText(/Aug 9, 11:00 PM EDT · 03:00 UTC/i)).toBeInTheDocument();
    expect(screen.getByText(/detected session starts differ by 45 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/recorded 25 nap minutes separately/i)).toBeInTheDocument();
    expect(screen.getByText(/divergent · isolated/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/7,200 steps · 30 active min/i)).toBeInTheDocument());
    expect(screen.getByText("Example medication")).toBeInTheDocument();
  });

  it("shows evidence maturity without presenting it as sensor accuracy", async () => {
    renderSensors();
    expect(await screen.findByText("limited evidence")).toBeInTheDocument();
    expect(screen.getByText(/not a sensor-accuracy verdict|preliminary and may move/i)).toBeInTheDocument();
  });
});
