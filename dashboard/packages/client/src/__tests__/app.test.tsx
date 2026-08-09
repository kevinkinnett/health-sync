import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
// `waitFor` is used by the Dashboard mount test — the Loading state
// renders synchronously but we wrap to keep the test resilient to
// future async changes in `useHealthSummary`.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { AnalyticsLayout } from "../components/AnalyticsLayout";
import { Dashboard } from "../pages/Dashboard";
import { Ingest } from "../pages/Ingest";
import { AnalyticsOverview } from "../pages/analytics/Overview";
import { AnalyticsActivity } from "../pages/analytics/Activity";
import { AnalyticsSleep } from "../pages/analytics/Sleep";
import { AnalyticsHeartRate } from "../pages/analytics/HeartRate";

// Mock all API calls to return empty/loading states. The readiness
// endpoint must return a valid (insufficient) ReadinessScore object —
// the Dashboard's ReadinessCard reads `.band`, so a bare [] would
// crash the render.
vi.mock("../api/client", () => ({
  apiFetch: vi.fn((path?: string) =>
    path?.includes("/health/summary")
      ? Promise.resolve({
          activity: { latest: null, sparkline: [] },
          sleep: { latest: null, sparkline: [] },
          heartRate: { latest: null, sparkline: [] },
          weight: { latest: null, sparkline: [] },
        })
      : path?.includes("/health/readiness")
      ? Promise.resolve({
          date: null,
          score: null,
          band: "insufficient",
          summary: "",
          baselineDays: 0,
          components: [],
          history: [],
        })
      : Promise.resolve([]),
  ),
}));


function renderWithProviders(initialRoute = "/") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics" element={<AnalyticsLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<AnalyticsOverview />} />
              <Route path="activity" element={<AnalyticsActivity />} />
              <Route path="sleep" element={<AnalyticsSleep />} />
              <Route path="heart-rate" element={<AnalyticsHeartRate />} />
            </Route>
            <Route
              path="/explore"
              element={<Navigate to="/analytics/overview" replace />}
            />
            <Route path="/ingest" element={<Ingest />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App routing and layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the nav bar with all navigation links", () => {
    renderWithProviders();
    expect(screen.getByText("VITALIS")).toBeInTheDocument();
    expect(screen.getAllByText("Today").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Trends").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Data Pipeline").length).toBeGreaterThanOrEqual(1);
  });

  it("renders date range presets in the nav", () => {
    renderWithProviders();
    expect(screen.getByText("7D")).toBeInTheDocument();
    expect(screen.getByText("30D")).toBeInTheDocument();
    expect(screen.getByText("90D")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("mounts the Dashboard route at /", async () => {
    renderWithProviders("/");
    await waitFor(() => expect(screen.getByText("Your daily briefing")).toBeInTheDocument());
  });

  it("renders Analytics layout with sub-nav at /analytics/overview", () => {
    renderWithProviders("/analytics/overview");
    const picker = screen.getByLabelText("Explore health view");
    expect(picker).toHaveValue("/analytics/overview");
    expect(screen.getByRole("option", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sleep" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Heart Rate" })).toBeInTheDocument();
  });

  it("redirects /explore to the analytics overview", () => {
    renderWithProviders("/explore");
    expect(screen.getByLabelText("Explore health view")).toHaveValue("/analytics/overview");
    expect(screen.getByRole("option", { name: "Correlations" })).toBeInTheDocument();
  });

  it("renders Ingest page at /ingest", async () => {
    renderWithProviders("/ingest");
    expect(await screen.findByText("Pipeline Status")).toBeInTheDocument();
    expect(screen.getByText("Backfill Progress by Data Type")).toBeInTheDocument();
  });
});
