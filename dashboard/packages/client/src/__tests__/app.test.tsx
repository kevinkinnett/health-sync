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
    path?.includes("/health/readiness")
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
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Analytics").length).toBeGreaterThanOrEqual(1);
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
    // We can't easily assert Dashboard-specific content here because
    // the global mock returns `[]` for every endpoint — `useHealthSummary`
    // hangs on `isLoading` forever (it never receives a HealthSummary
    // shape it can render against). What we CAN verify is that the
    // route mounts the Dashboard component (vs e.g. routing to a 404).
    // The Dashboard's own render contract is exercised by
    // `unitsToggle.test.tsx`, which mocks /health/summary properly.
    renderWithProviders("/");
    await waitFor(() =>
      expect(screen.getByText("Loading...")).toBeInTheDocument(),
    );
  });

  it("renders Analytics layout with sub-nav at /analytics/overview", () => {
    renderWithProviders("/analytics/overview");
    // The AnalyticsLayout sub-nav exposes pills for every metric — these
    // overlap with the page-level labels but the count should be ≥1.
    expect(screen.getAllByText("Overview").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Activity").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Sleep").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Heart Rate").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Supplements").length).toBeGreaterThanOrEqual(1);
  });

  it("redirects /explore to the analytics overview", () => {
    renderWithProviders("/explore");
    // After the redirect the analytics sub-nav should be visible.
    expect(screen.getAllByText("Overview").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Correlations").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Ingest page at /ingest", () => {
    renderWithProviders("/ingest");
    expect(screen.getByText("Pipeline Status")).toBeInTheDocument();
    expect(screen.getByText("Backfill Progress by Data Type")).toBeInTheDocument();
  });
});
