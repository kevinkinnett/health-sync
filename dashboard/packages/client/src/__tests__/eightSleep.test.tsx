import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsEightSleep } from "../pages/analytics/EightSleep";
import type { EightSleepDay } from "@health-dashboard/shared";

const apiFetchMock = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (path?: string) => apiFetchMock(path),
}));

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AnalyticsEightSleep />
    </QueryClientProvider>,
  );
}

const night = (over: Partial<EightSleepDay>): EightSleepDay => ({
  date: "2026-05-28",
  score: 95,
  sleepDurationMin: 432,
  deepMin: 114,
  lightMin: 216,
  remMin: 102,
  avgHeartRate: 60.1,
  avgHrvRmssd: 51.0,
  avgRespiratoryRate: 12.6,
  avgBedTempC: 25.5,
  avgRoomTempC: 23.5,
  tnt: 12,
  sleepStart: null,
  sleepEnd: null,
  ...over,
});

describe("AnalyticsEightSleep", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("renders the last-night card + metric charts from real data", async () => {
    apiFetchMock.mockImplementation((p?: string) =>
      p?.includes("/health/eight-sleep")
        ? Promise.resolve([night({ date: "2026-05-28" }), night({ date: "2026-05-29", score: 83 })])
        : Promise.resolve([]),
    );
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Last night")).toBeInTheDocument();
      expect(screen.getByText("Sleep Score")).toBeInTheDocument();
      expect(screen.getByText("Overnight Heart Rate")).toBeInTheDocument();
      expect(screen.getByText("HRV (RMSSD)")).toBeInTheDocument();
      expect(screen.getByText("Bed Temperature")).toBeInTheDocument();
      expect(screen.getByText("Restlessness (toss & turns)")).toBeInTheDocument();
    });
  });

  it("shows an empty state when there are no nights in the window", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve([]));
    renderScreen();
    await waitFor(() =>
      expect(
        screen.getByText(/No Eight Sleep nights in this window/i),
      ).toBeInTheDocument(),
    );
  });
});
