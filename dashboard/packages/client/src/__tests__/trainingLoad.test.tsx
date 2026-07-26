import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnalyticsExercises } from "../pages/analytics/Exercises";
import type { TrainingSummary } from "@health-dashboard/shared";

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
      <AnalyticsExercises />
    </QueryClientProvider>,
  );
}

/** Mirrors the real three weeks: strength dominates, walking is a rounding error. */
const SUMMARY: TrainingSummary = {
  days: [
    { date: "2026-07-24", load: 42.5, sessions: 1, minutes: 50, byType: { strength: 42.5 }, estimated: false },
    { date: "2026-07-25", load: 14.7, sessions: 1, minutes: 26, byType: { strength: 14.7 }, estimated: false },
    { date: "2026-07-26", load: 6.1, sessions: 1, minutes: 22, byType: { walk: 6.1 }, estimated: false },
  ],
  sessions: [
    {
      logId: 1,
      date: "2026-07-24",
      activityName: "Workout",
      type: "strength",
      minutes: 50,
      averageHeartRate: 124,
      steps: null,
      calories: 438,
      load: 42.5,
      estimated: false,
    },
  ],
  totalByType: { strength: 57.2, walk: 6.1 },
  sessionsPerWeek: 3.0,
};

describe("AnalyticsExercises — training load", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((p?: string) =>
      p?.includes("/health/training-load")
        ? Promise.resolve(SUMMARY)
        : Promise.resolve([]),
    );
  });

  it("shows effort that produced no steps", async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText("Training load")).toBeInTheDocument(),
    );
    // Strength load must be surfaced on its own — the whole point is that
    // it is invisible in every step-derived view.
    expect(screen.getByText("Strength load")).toBeInTheDocument();
    expect(screen.getByText("57")).toBeInTheDocument();
  });

  it("reports how often the user is actually training", async () => {
    renderScreen();
    await waitFor(() => screen.getByText("Training load"));
    expect(screen.getByText("Sessions / week")).toBeInTheDocument();
    expect(screen.getByText("3.0")).toBeInTheDocument();
  });

  it("states that the score is self-relative rather than absolute", async () => {
    // The metric assumes a maximum heart rate, so the caveat is part of
    // the feature, not decoration.
    renderScreen();
    await waitFor(() => screen.getByText("Training load"));
    expect(screen.getByText(/self-relative index/i)).toBeInTheDocument();
  });

  it("falls back to an empty state when nothing was logged", async () => {
    apiFetchMock.mockImplementation((p?: string) =>
      p?.includes("/health/training-load")
        ? Promise.resolve({ days: [], sessions: [], totalByType: {}, sessionsPerWeek: 0 })
        : Promise.resolve([]),
    );
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(/No training load in this window/i)).toBeInTheDocument(),
    );
  });
});
