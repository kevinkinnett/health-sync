import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { RecoveryAnomalyReport } from "@health-dashboard/shared";
import { AnalyticsUnusualDays } from "../pages/analytics/UnusualDays";

const apiFetch = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const REPORT: RecoveryAnomalyReport = {
  methodVersion: "recovery-anomaly-v1-robust-weekday",
  timezone: "America/New_York",
  baselineWindowDays: 42,
  minimumBaselineDays: 14,
  window: { start: "2026-07-01", end: "2026-08-11" },
  excludedCurrentDate: "2026-08-12",
  daysAnalyzed: 35,
  caveats: ["Unusual means different from your own recent pattern, not unhealthy or diagnostic."],
  unusualDays: [{
    date: "2026-08-10",
    score: 78,
    severity: "strong",
    direction: "worse",
    summary: "HRV, Resting HR made this a worse-than-usual recovery day.",
    coveragePct: 86,
    features: ["hrv", "rhr", "sleep"].map((metric, index) => ({
      metric: metric as "hrv" | "rhr" | "sleep",
      label: metric === "hrv" ? "HRV" : metric === "rhr" ? "Resting HR" : "Sleep",
      unit: metric === "sleep" ? "min" : metric === "rhr" ? "bpm" : "ms",
      value: 40 + index,
      expected: 50 + index,
      recoveryZ: -2.8 + index * 0.2,
      impact: "worse" as const,
      sources: [{
        provenance: {
          device: "fitbit" as const,
          deviceLabel: "Fitbit device",
          provider: "google_health" as const,
          providerLabel: "Google Health",
        },
        value: 40 + index,
        expected: 50 + index,
        z: -2.8 + index * 0.2,
        measurement: "Overnight measurement",
        regime: "current-v1",
        baselineDays: 42,
      }],
    })),
  }],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AnalyticsUnusualDays /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Unusual Days report", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue(REPORT);
  });

  it("summarizes evidence and reveals source-level explanations", async () => {
    renderPage();
    expect(await screen.findByText("35")).toBeInTheDocument();
    expect(screen.getByText("Computed live")).toBeVisible();
    expect(screen.getByText("HRV, Resting HR made this a worse-than-usual recovery day.")).toBeInTheDocument();

    const disclosure = screen.getByText("2026-08-10").closest("summary");
    expect(disclosure).not.toBeNull();
    fireEvent.click(disclosure!);
    expect(screen.getAllByText(/Fitbit device · 42 baseline days/)).toHaveLength(3);
    expect(screen.getByText(/not unhealthy or diagnostic/i)).toBeInTheDocument();
  });
});
