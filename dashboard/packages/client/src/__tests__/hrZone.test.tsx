import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { HeartRateDay } from "@health-dashboard/shared";
import { AnalyticsHeartRate } from "../pages/analytics/HeartRate";
import { activeZoneMinutes } from "../components/charts/HrZoneChart";

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
      <AnalyticsHeartRate />
    </QueryClientProvider>,
  );
}

function day(over: Partial<HeartRateDay> = {}): HeartRateDay {
  return {
    date: "2026-07-31",
    restingHeartRate: 66,
    zoneOutOfRangeMin: null,
    zoneFatBurnMin: 0,
    zoneCardioMin: 0,
    zonePeakMin: 0,
    // Google has no equivalent for the per-zone calorie split, so these are
    // NULL for every day after the 2026-06-12 cutover. The screen must not
    // depend on them.
    zoneOutOfRangeCal: null,
    zoneFatBurnCal: null,
    zoneCardioCal: null,
    zonePeakCal: null,
    fetchedAt: "2026-07-31T12:00:00.000Z",
    ...over,
  };
}

describe("activeZoneMinutes", () => {
  it("counts cardio and peak minutes double, fat burn single", () => {
    expect(activeZoneMinutes({ fatBurn: 26, cardio: 15, peak: 0 })).toBe(56);
    expect(activeZoneMinutes({ fatBurn: 0, cardio: 0, peak: 10 })).toBe(20);
  });

  it("is not the plain sum of minutes", () => {
    // The regression this replaces: the card summed raw minutes and labelled
    // the result AZM, so a hard session read the same as an easy one of equal
    // length. Any implementation where these agree has lost the weighting.
    const z = { fatBurn: 26, cardio: 15, peak: 2 };
    expect(activeZoneMinutes(z)).not.toBe(z.fatBurn + z.cardio + z.peak);
    expect(activeZoneMinutes(z)).toBe(60);
  });

  it("is zero for a day with no zone time", () => {
    expect(activeZoneMinutes({ fatBurn: 0, cardio: 0, peak: 0 })).toBe(0);
  });
});

describe("AnalyticsHeartRate — zone display", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("shows AZM per day, weighted, alongside raw minutes in zone", async () => {
    // Two real days off the watch: 07-30 and 07-31.
    // minutes = 33+26 fat burn, 11+15 cardio -> 59 fb + 26 cardio
    // AZM     = 59 + 2*26 = 111 over 2 days -> 56/day (55.5 rounded)
    // minutes = 85 over 2 days -> 43/day (42.5 rounded)
    apiFetchMock.mockResolvedValue([
      day({ date: "2026-07-30", zoneFatBurnMin: 33, zoneCardioMin: 11 }),
      day({ date: "2026-07-31", zoneFatBurnMin: 26, zoneCardioMin: 15 }),
    ]);
    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId("hr-azm-per-day")).toHaveTextContent("56 AZM/day"),
    );
    expect(screen.getByText("43 min/day in zone")).toBeInTheDocument();
  });

  it("explains an empty window instead of rendering silent zeroes", async () => {
    // Exactly the state the screen sat in for seven weeks: resting HR present,
    // every zone column NULL because nothing rolled active-zone-minutes up.
    // Zeroes read as "you did nothing"; this must read as "no data".
    apiFetchMock.mockResolvedValue([
      day({ date: "2026-06-20", zoneFatBurnMin: null, zoneCardioMin: null, zonePeakMin: null }),
      day({ date: "2026-06-21", zoneFatBurnMin: null, zoneCardioMin: null, zonePeakMin: null }),
    ]);
    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId("hr-zone-empty")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("hr-azm-per-day")).not.toBeInTheDocument();
  });

  it("still renders resting HR when zone data is missing", async () => {
    // The zone gap must not take the rest of the screen down with it.
    apiFetchMock.mockResolvedValue([
      day({ date: "2026-06-20", restingHeartRate: 64, zoneFatBurnMin: null }),
    ]);
    renderScreen();

    await waitFor(() =>
      expect(screen.getByTestId("hr-zone-empty")).toBeInTheDocument(),
    );
    expect(screen.getByText("64 bpm")).toBeInTheDocument();
  });
});
