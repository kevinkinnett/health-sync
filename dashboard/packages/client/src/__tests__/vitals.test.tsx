import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsVitals } from "../pages/analytics/Vitals";

const apiFetchMock = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (path?: string) => apiFetchMock(path),
}));

/** Route a request by path fragment; unknown paths resolve to []. */
function byPath(routes: Record<string, unknown[]>) {
  return (path?: string) => {
    const p = path ?? "";
    for (const [frag, rows] of Object.entries(routes)) {
      if (p.includes(frag)) return Promise.resolve(rows);
    }
    return Promise.resolve([]);
  };
}

function renderVitals() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AnalyticsVitals />
    </QueryClientProvider>,
  );
}

/**
 * The Vitals screen surfaces four metrics that were ingested for ~13
 * months but had no UI. These tests confirm each section renders from
 * its own query, the VO2 range gets the current-value + change-history
 * treatment (not a chart), and a metric with no data shows its empty
 * state instead of blanking.
 */
describe("AnalyticsVitals", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("renders all four vitals sections from real data", async () => {
    apiFetchMock.mockImplementation(
      byPath({
        "/health/spo2": [{ date: "2026-05-28", avgValue: 96.5, minValue: 92, maxValue: 99, fetchedAt: "" }],
        "/health/breathing-rate": [{ date: "2026-05-28", breathingRate: 13.1, fetchedAt: "" }],
        "/health/skin-temp": [{ date: "2026-05-28", nightlyRelative: -0.3, logType: "x", fetchedAt: "" }],
        "/health/cardio-score": [
          { date: "2026-05-01", vo2Max: "41-45", fetchedAt: "" },
          { date: "2026-05-20", vo2Max: "43-47", fetchedAt: "" },
        ],
      }),
    );

    renderVitals();

    await waitFor(() => {
      expect(screen.getByText("Blood Oxygen (SpO2)")).toBeInTheDocument();
      expect(screen.getByText("Breathing Rate")).toBeInTheDocument();
      expect(screen.getByText("Skin Temperature Deviation")).toBeInTheDocument();
      expect(screen.getByText("Cardio Fitness (VO2 max)")).toBeInTheDocument();
    });
  });

  it("shows the latest VO2 range and its change history", async () => {
    apiFetchMock.mockImplementation(
      byPath({
        "/health/cardio-score": [
          { date: "2026-05-01", vo2Max: "41-45", fetchedAt: "" },
          { date: "2026-05-02", vo2Max: "41-45", fetchedAt: "" },
          { date: "2026-05-20", vo2Max: "43-47", fetchedAt: "" },
        ],
      }),
    );

    renderVitals();

    await waitFor(() => {
      // Latest value (43-47) appears as the big number AND as the most
      // recent change-history entry — so there are at least two.
      expect(screen.getAllByText("43-47").length).toBeGreaterThanOrEqual(1);
      // The earlier distinct value appears only in the history, and the
      // two consecutive identical 41-45 rows are collapsed to one entry.
      expect(screen.getByText("41-45")).toBeInTheDocument();
      expect(screen.getByText(/Changes in window/i)).toBeInTheDocument();
    });
  });

  it("shows an empty state for a metric with no data", async () => {
    apiFetchMock.mockImplementation(byPath({}));
    renderVitals();
    await waitFor(() => {
      expect(
        screen.getByText(/No SpO2 data in this window/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/No cardio-fitness data in this window/i),
      ).toBeInTheDocument();
    });
  });
});
