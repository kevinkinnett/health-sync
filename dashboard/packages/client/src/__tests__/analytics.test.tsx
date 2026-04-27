import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import type {
  IntakeCorrelations,
  SupplementAdherence,
} from "@health-dashboard/shared";
import { Layout } from "../components/Layout";
import { AnalyticsLayout } from "../components/AnalyticsLayout";
import { AnalyticsOverview } from "../pages/analytics/Overview";
import { AnalyticsActivity } from "../pages/analytics/Activity";
import { AnalyticsRecords } from "../pages/analytics/Records";
import { AnalyticsCorrelations } from "../pages/analytics/Correlations";
import { AnalyticsSupplements } from "../pages/analytics/Supplements";
import { Dashboard } from "../pages/Dashboard";

const apiFetch = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function renderAt(initialRoute: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
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
              <Route path="records" element={<AnalyticsRecords />} />
              <Route
                path="correlations"
                element={<AnalyticsCorrelations />}
              />
              <Route
                path="supplements"
                element={<AnalyticsSupplements />}
              />
            </Route>
            <Route
              path="/explore"
              element={<Navigate to="/analytics/overview" replace />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue([]);
});

describe("Analytics section", () => {
  it("/analytics redirects to /analytics/overview and renders the sub-nav", async () => {
    renderAt("/analytics");
    // The pill nav contains all 11 sub-screens; just check a few of them.
    await waitFor(() => {
      expect(screen.getAllByText("Overview").length).toBeGreaterThanOrEqual(
        1,
      );
    });
    expect(screen.getAllByText("Activity").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("Supplements").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText("Medications").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("/explore redirects into /analytics", async () => {
    renderAt("/explore");
    await waitFor(() => {
      // After the redirect the analytics layout's sub-nav is visible.
      expect(
        screen.getAllByText("Correlations").length,
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("Dashboard no longer renders Personal Records or Cross-Metric Correlations", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/health/summary") {
        return Promise.resolve({
          activity: { latest: null, sparkline: [] },
          sleep: { latest: null, sparkline: [] },
          heartRate: { latest: null, sparkline: [] },
          weight: { latest: null, sparkline: [] },
        });
      }
      // Other queries — including the weekly insights — return null so
      // the conditional renders short-circuit. We only need to assert
      // that records/correlations aren't on the page anymore.
      return Promise.resolve(null);
    });
    renderAt("/");
    await waitFor(() => {
      // Loading state resolves
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Personal Records")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Cross-Metric Correlations"),
    ).not.toBeInTheDocument();
  });

  it("supplement screen renders adherence stats and a scatter panel for each pair", async () => {
    const adherence: SupplementAdherence = {
      itemId: 7,
      itemName: "Anxie-T",
      start: "2026-04-01",
      end: "2026-04-30",
      totalDoses: 22,
      daysWithIntake: 22,
      daysInWindow: 30,
      currentStreak: 5,
      bestStreak: 11,
      byDayOfWeek: [
        { dow: 0, dayName: "Sun", avgDoses: 0.6 },
        { dow: 1, dayName: "Mon", avgDoses: 0.9 },
        { dow: 2, dayName: "Tue", avgDoses: 1.1 },
        { dow: 3, dayName: "Wed", avgDoses: 0.8 },
        { dow: 4, dayName: "Thu", avgDoses: 0.7 },
        { dow: 5, dayName: "Fri", avgDoses: 0.6 },
        { dow: 6, dayName: "Sat", avgDoses: 0.4 },
      ],
      daily: Array.from({ length: 30 }, (_, i) => ({
        date: `2026-04-${String(i + 1).padStart(2, "0")}`,
        doses: i % 3 === 0 ? 0 : 1,
      })),
    };
    const correlations: IntakeCorrelations = {
      itemId: 7,
      itemName: "Anxie-T",
      lagDays: 0,
      pairs: [
        {
          metric: "sleepMin",
          metricLabel: "Sleep (minutes)",
          correlation: 0.42,
          n: 18,
          insight: "Moderate positive: more sleep on intake days.",
          points: [
            { x: 1, y: 420, date: "2026-04-02" },
            { x: 0, y: 380, date: "2026-04-04" },
            { x: 1, y: 440, date: "2026-04-05" },
          ],
        },
        {
          metric: "dailyRmssd",
          metricLabel: "Daily RMSSD",
          correlation: 0.18,
          n: 14,
          insight: "Weak positive lift in HRV.",
          points: [{ x: 1, y: 38, date: "2026-04-02" }],
        },
      ],
    };

    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/supplements/items")) {
        return Promise.resolve([
          {
            id: 7,
            name: "Anxie-T",
            brand: "Vital Plan",
            form: "capsule",
            defaultAmount: 2,
            defaultUnit: "capsule",
            notes: null,
            isActive: true,
            createdAt: "2026-04-26T00:00:00Z",
            updatedAt: "2026-04-26T00:00:00Z",
            ingredients: [],
          },
        ]);
      }
      if (path.startsWith("/analytics/supplements/intake-by-day")) {
        return Promise.resolve([
          {
            date: "2026-04-02",
            itemId: 7,
            itemName: "Anxie-T",
            totalAmount: 2,
            unit: "capsule",
            count: 1,
          },
        ]);
      }
      if (path.startsWith("/analytics/supplements/ingredient-by-day")) {
        return Promise.resolve([]);
      }
      if (path.startsWith("/analytics/supplements/adherence/")) {
        return Promise.resolve(adherence);
      }
      if (path.startsWith("/analytics/supplements/correlations/")) {
        return Promise.resolve(correlations);
      }
      return Promise.resolve([]);
    });

    renderAt("/analytics/supplements");

    // The headline picker label and selector should show up.
    await waitFor(() => {
      expect(screen.getByText("Supplement")).toBeInTheDocument();
    });

    // Adherence stat tiles populate after the auto-selection effect runs.
    await waitFor(() => {
      expect(screen.getByText("Current Streak")).toBeInTheDocument();
    });
    expect(screen.getByText("Best Streak")).toBeInTheDocument();
    expect(screen.getByText("% Days Taken")).toBeInTheDocument();
    expect(screen.getByText("Peak Day")).toBeInTheDocument();

    // Both ScatterPanels should render — one per pair.
    await waitFor(() => {
      expect(
        screen.getByText(/Took Anxie-T vs Sleep \(minutes\)/i),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Took Anxie-T vs Daily RMSSD/i),
    ).toBeInTheDocument();
  });

  it("supplement screen shows insufficient-data message when no pairs come back", async () => {
    const adherence: SupplementAdherence = {
      itemId: 7,
      itemName: "Anxie-T",
      start: "2026-04-01",
      end: "2026-04-30",
      totalDoses: 0,
      daysWithIntake: 0,
      daysInWindow: 30,
      currentStreak: 0,
      bestStreak: 0,
      byDayOfWeek: [],
      daily: [],
    };
    const correlations: IntakeCorrelations = {
      itemId: 7,
      itemName: "Anxie-T",
      lagDays: 0,
      pairs: [],
    };
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/supplements/items")) {
        return Promise.resolve([
          {
            id: 7,
            name: "Anxie-T",
            brand: null,
            form: null,
            defaultAmount: null,
            defaultUnit: "capsule",
            notes: null,
            isActive: true,
            createdAt: "",
            updatedAt: "",
            ingredients: [],
          },
        ]);
      }
      if (path.startsWith("/analytics/supplements/intake-by-day")) {
        return Promise.resolve([
          {
            date: "2026-04-02",
            itemId: 7,
            itemName: "Anxie-T",
            totalAmount: 1,
            unit: "capsule",
            count: 1,
          },
        ]);
      }
      if (path.startsWith("/analytics/supplements/adherence/")) {
        return Promise.resolve(adherence);
      }
      if (path.startsWith("/analytics/supplements/correlations/")) {
        return Promise.resolve(correlations);
      }
      return Promise.resolve([]);
    });

    renderAt("/analytics/supplements");
    await waitFor(() => {
      expect(
        screen.getByText(/Insufficient overlapping data/i),
      ).toBeInTheDocument();
    });
  });

  it("changing the lag pill triggers a refetch of correlations", async () => {
    const baseAdherence: SupplementAdherence = {
      itemId: 7,
      itemName: "Anxie-T",
      start: "2026-04-01",
      end: "2026-04-30",
      totalDoses: 5,
      daysWithIntake: 5,
      daysInWindow: 30,
      currentStreak: 1,
      bestStreak: 3,
      byDayOfWeek: [
        { dow: 1, dayName: "Mon", avgDoses: 1 },
      ],
      daily: [{ date: "2026-04-02", doses: 1 }],
    };
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/supplements/items")) {
        return Promise.resolve([
          {
            id: 7,
            name: "Anxie-T",
            brand: null,
            form: null,
            defaultAmount: null,
            defaultUnit: "capsule",
            notes: null,
            isActive: true,
            createdAt: "",
            updatedAt: "",
            ingredients: [],
          },
        ]);
      }
      if (path.startsWith("/analytics/supplements/intake-by-day")) {
        return Promise.resolve([
          {
            date: "2026-04-02",
            itemId: 7,
            itemName: "Anxie-T",
            totalAmount: 1,
            unit: "capsule",
            count: 1,
          },
        ]);
      }
      if (path.startsWith("/analytics/supplements/adherence/")) {
        return Promise.resolve(baseAdherence);
      }
      if (path.startsWith("/analytics/supplements/correlations/")) {
        return Promise.resolve({
          itemId: 7,
          itemName: "Anxie-T",
          lagDays: path.includes("lag=1") ? 1 : 0,
          pairs: [],
        });
      }
      return Promise.resolve([]);
    });

    renderAt("/analytics/supplements");
    await waitFor(() => {
      expect(screen.getByText("Same day")).toBeInTheDocument();
    });
    // Wait for the auto-selection effect to actually fire the lag=0 call
    // before clicking +1 day so we can assert a *new* lag=1 call.
    await waitFor(() => {
      expect(
        apiFetch.mock.calls.some(([p]) =>
          String(p).includes(
            "/analytics/supplements/correlations/7?lag=0",
          ),
        ),
      ).toBe(true);
    });
    fireEvent.click(screen.getByText("+1 day"));
    await waitFor(() => {
      expect(
        apiFetch.mock.calls.some(([p]) =>
          String(p).includes(
            "/analytics/supplements/correlations/7?lag=1",
          ),
        ),
      ).toBe(true);
    });
  });
});
