import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnalyticsNutrition } from "../pages/analytics/Nutrition";
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
      <AnalyticsNutrition />
    </QueryClientProvider>,
  );
}

describe("AnalyticsNutrition", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path?: string) =>
      path?.includes("/health/nutrition-weight")
        ? Promise.resolve(collectingNutritionWeightReport)
        : Promise.resolve([]),
    );
  });

  it("leads with coverage and energy while preserving missing and provisional days", async () => {
    renderScreen();
    expect(await screen.findByText("Energy and logging summary")).toBeInTheDocument();
    expect(screen.getByText("29%")).toBeInTheDocument();
    expect(screen.getByText("2 of 7 completed days")).toBeInTheDocument();
    expect(screen.getByText("Today is provisional")).toBeInTheDocument();
    expect(screen.getByText(/Missing food logs remain unknown/i)).toBeInTheDocument();
    expect(screen.getByText(/does not establish cause and effect/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Protein" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fiber" })).toBeInTheDocument();
    expect(screen.getByText("More nutrient detail")).toBeInTheDocument();
    expect(screen.getByText("Last logged day")).toBeInTheDocument();
  });

  it("shows the collection thresholds instead of long-window conclusions", async () => {
    renderScreen();
    expect(await screen.findByText("Building a useful history")).toBeInTheDocument();
    expect(screen.getByText("7 / 42 days")).toBeInTheDocument();
    expect(screen.getByText("2 / 30 days")).toBeInTheDocument();
    expect(screen.getByText("2 / 18 dates")).toBeInTheDocument();
  });

  it("shows an empty state when no food is logged in the window", async () => {
    apiFetchMock.mockImplementation((path?: string) =>
      path?.includes("/health/nutrition-weight")
        ? Promise.resolve(emptyNutritionWeightReport)
        : Promise.resolve([]),
    );
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(/No food logs in this window yet/i)).toBeInTheDocument(),
    );
  });
});
