import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HrvDay } from "@health-dashboard/shared";
import { AnalyticsHrv } from "../pages/analytics/Hrv";

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
      <AnalyticsHrv />
    </QueryClientProvider>,
  );
}

function day(date: string, dailyRmssd: number, deepRmssd: number | null): HrvDay {
  return {
    date,
    dailyRmssd,
    deepRmssd,
    nonRemHeartRate: null,
    measurementMethod: "daily_hrv_v1",
    fetchedAt: `${date}T12:00:00.000Z`,
  };
}

describe("AnalyticsHrv — deep sleep RMSSD", () => {
  beforeEach(() => apiFetchMock.mockReset());

  // NOTE: whether the deep-sleep LINE actually draws is asserted in the e2e
  // suite, not here. Even with setup.ts giving jsdom an element box, Recharts
  // emits no curve geometry under jsdom — only chrome — and the legend entry
  // renders whether or not the series has a single non-null point. A missing
  // series is invisible to this file by construction. See the e2e case "the
  // HRV chart draws the deep sleep series".

  it("flags the source change when the window spans it", async () => {
    apiFetchMock.mockResolvedValue([
      day("2026-06-11", 37.2, 33.0),
      day("2026-06-12", 43.9, 36.4),
      day("2026-06-13", 44.5, 37.1),
    ]);
    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId("hrv-source-caveat")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("hrv-source-caveat")).toHaveTextContent("2026-06-12");
  });

  it("stays quiet about the source change outside that window", async () => {
    // A caveat on every window would be noise, and the marker itself cannot
    // anchor to a date the axis does not contain.
    apiFetchMock.mockResolvedValue([
      day("2026-07-29", 44.1, 38.2),
      day("2026-07-30", 41.5, 35.9),
    ]);
    renderScreen();

    await waitFor(() =>
      expect(screen.getByText("Deep Sleep RMSSD")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("hrv-source-caveat")).not.toBeInTheDocument();
  });

  it("still renders when deep RMSSD is missing for the whole window", async () => {
    // Pre-2025 history, and the seven-week gap this fix closes, both look
    // like this. The daily line must survive on its own.
    apiFetchMock.mockResolvedValue([
      day("2026-06-20", 42.0, null),
      day("2026-06-21", 43.5, null),
    ]);
    renderScreen();

    await waitFor(() =>
      expect(screen.getByText("Deep Sleep RMSSD")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Heart Rate Variability/)).toBeInTheDocument();
  });
});
