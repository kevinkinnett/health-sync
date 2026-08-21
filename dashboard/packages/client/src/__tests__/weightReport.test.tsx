import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsWeight } from "../pages/analytics/Weight";
import { useUnitsStore } from "../stores/unitsStore";
import {
  collectingNutritionWeightReport,
  emptyNutritionWeightReport,
} from "./fixtures/nutritionWeight";

const apiFetchMock = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (path?: string) => apiFetchMock(path),
}));

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsWeight />
    </QueryClientProvider>,
  );
}

describe("AnalyticsWeight", () => {
  beforeEach(() => {
    useUnitsStore.setState({ units: "imperial" });
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path?: string) =>
      path?.includes("/health/nutrition-weight")
        ? Promise.resolve(collectingNutritionWeightReport)
        : Promise.resolve([]),
    );
  });

  it("shows preferred units, raw same-day observations, cadence, and gated changes", async () => {
    renderScreen();
    expect(await screen.findByText("Weight observations and trend")).toBeInTheDocument();
    expect(screen.getAllByText("198.2 lb").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("3 total observations")).toBeInTheDocument();
    expect(screen.getAllByText("Collecting data")).toHaveLength(2);
    expect(screen.getByText("2026-08-18 at 07:15")).toBeInTheDocument();
    expect(screen.getByText("2026-08-18 at 19:40")).toBeInTheDocument();
    expect(screen.getByText("198.4 lb")).toBeInTheDocument();
    expect(screen.getByText("198.0 lb")).toBeInTheDocument();
  });

  it("states that aligned energy and training context is not causal", async () => {
    renderScreen();
    expect(await screen.findByText(/not causation/i)).toBeInTheDocument();
    expect(await screen.findByText(/provides context, not proof of an effect/i)).toBeInTheDocument();
  });

  it("shows an empty state when no weight observations exist", async () => {
    apiFetchMock.mockImplementation((path?: string) =>
      path?.includes("/health/nutrition-weight")
        ? Promise.resolve(emptyNutritionWeightReport)
        : Promise.resolve([]),
    );
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(/No weight observations in this window/i)).toBeInTheDocument(),
    );
  });
});
