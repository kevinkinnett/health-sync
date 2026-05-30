import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsNutrition } from "../pages/analytics/Nutrition";
import type { FoodLogDay } from "@health-dashboard/shared";

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
      <AnalyticsNutrition />
    </QueryClientProvider>,
  );
}

const SAMPLE: FoodLogDay[] = [
  {
    date: "2026-05-29",
    caloriesIn: 266,
    carbs: 33,
    fat: 12.75,
    fiber: 2,
    protein: 10.5,
    sodium: 180,
    water: 0,
    calorieGoal: null,
    foodCount: 2,
  },
];

describe("AnalyticsNutrition", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("renders the latest-day card + macro charts from real data", async () => {
    apiFetchMock.mockImplementation((p?: string) =>
      p?.includes("/health/food") ? Promise.resolve(SAMPLE) : Promise.resolve([]),
    );
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Last logged day")).toBeInTheDocument();
      // Card shows the day's calories (unique value).
      expect(screen.getByText("266")).toBeInTheDocument();
      // Unique chart titles ("Carbs"/"Calories" are the card labels).
      expect(screen.getByText("Calories In")).toBeInTheDocument();
      expect(screen.getByText("Carbohydrates")).toBeInTheDocument();
      // Protein appears as both a card label and a chart title.
      expect(screen.getAllByText("Protein").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows an empty state when nothing is logged in the window", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve([]));
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(/No food logged in this window/i)).toBeInTheDocument(),
    );
  });
});
