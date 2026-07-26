import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Timeline } from "../pages/Timeline";
import type { ExperimentReport, Intervention } from "@health-dashboard/shared";

const apiFetchMock = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (path?: string, init?: RequestInit) => apiFetchMock(path, init),
}));

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Timeline />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const INTERVENTIONS: Intervention[] = [
  {
    id: 1,
    kind: "period",
    category: "device",
    name: "Eight Sleep Pod",
    startedOn: "2026-05-02",
    endedOn: null,
    source: "manual",
    sourceRef: null,
    detail: null,
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
  },
  {
    id: 2,
    kind: "period",
    category: "medication",
    name: "Escitalopram 10 mg",
    startedOn: "2026-05-08",
    endedOn: null,
    source: "derived",
    sourceRef: "medication.item:1:dose:10:2026-05-08",
    detail: "80 logged doses, ongoing",
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
  },
];

const REPORT: ExperimentReport = {
  interventionId: 1,
  interventionName: "Eight Sleep Pod",
  changepoint: "2026-05-02",
  before: { start: "2026-02-11", end: "2026-05-01", days: 80, observedDays: 77 },
  after: { start: "2026-05-02", end: "2026-07-20", days: 80, observedDays: 80 },
  metrics: [
    {
      metric: "sleepMin",
      label: "Time asleep",
      unit: "min",
      betterDirection: "up",
      before: { n: 77, mean: 391.9, sd: 52 },
      after: { n: 80, mean: 435.4, sd: 44 },
      delta: 43.5,
      deltaPct: 11.1,
      direction: "up",
      effectSize: 0.9,
      improved: true,
      meaningful: true,
    },
    {
      metric: "restingHr",
      label: "Resting heart rate",
      unit: "bpm",
      betterDirection: "down",
      before: { n: 90, mean: 67, sd: 3 },
      after: { n: 86, mean: 66.8, sd: 3 },
      delta: -0.2,
      deltaPct: -0.3,
      direction: "down",
      effectSize: -0.07,
      improved: true,
      meaningful: false,
    },
  ],
  confounds: [
    {
      kind: "nearby_intervention",
      severity: "high",
      date: "2026-05-08",
      detail:
        '"Escitalopram 10 mg" started 6 days from this change — too close to separate the two.',
    },
  ],
  confidence: "weak",
  summary:
    'After "Eight Sleep Pod", time asleep improved — but something else could explain it.',
};

function route(path?: string) {
  if (path?.startsWith("/experiments")) return Promise.resolve(REPORT);
  if (path?.startsWith("/interventions")) return Promise.resolve(INTERVENTIONS);
  return Promise.resolve([]);
}

describe("Timeline", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(route);
  });

  it("lists interventions with their dates", async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Eight Sleep Pod")).toBeInTheDocument();
      expect(screen.getByText("Escitalopram 10 mg")).toBeInTheDocument();
    });
    expect(screen.getByText(/2026-05-02 → now/)).toBeInTheDocument();
  });

  it("marks derived rows so they aren't mistaken for hand-entered ones", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("detected")).toBeInTheDocument());
  });

  it("offers delete only on manual rows — derived ones own their source", async () => {
    renderScreen();
    await waitFor(() => screen.getByText("Eight Sleep Pod"));
    expect(screen.getByLabelText("Delete Eight Sleep Pod")).toBeInTheDocument();
    expect(screen.queryByLabelText("Delete Escitalopram 10 mg")).toBeNull();
  });

  it("runs the report only after a change is selected", async () => {
    renderScreen();
    await waitFor(() => screen.getByText("Eight Sleep Pod"));
    expect(
      apiFetchMock.mock.calls.some(([p]) => String(p).startsWith("/experiments")),
    ).toBe(false);

    fireEvent.click(screen.getByText("Eight Sleep Pod"));
    await waitFor(() =>
      expect(screen.getByText(/time asleep improved/i)).toBeInTheDocument(),
    );
  });

  it("shows the confidence grade and the competing explanation", async () => {
    renderScreen();
    await waitFor(() => screen.getByText("Eight Sleep Pod"));
    fireEvent.click(screen.getByText("Eight Sleep Pod"));

    await waitFor(() => {
      expect(screen.getByText("Weak evidence")).toBeInTheDocument();
      // The confound must be visible, not buried — it is the reason the
      // headline number should not be trusted on its own.
      expect(screen.getByText(/too close to separate the two/i)).toBeInTheDocument();
    });
  });

  it("explains why no p-value is shown", async () => {
    renderScreen();
    await waitFor(() => screen.getByText("Eight Sleep Pod"));
    fireEvent.click(screen.getByText("Eight Sleep Pod"));
    await waitFor(() =>
      expect(screen.getByText(/autocorrelated/i)).toBeInTheDocument(),
    );
  });

  it("renders both metric rows, including the one that didn't move", async () => {
    renderScreen();
    await waitFor(() => screen.getByText("Eight Sleep Pod"));
    fireEvent.click(screen.getByText("Eight Sleep Pod"));
    await waitFor(() => {
      expect(screen.getByText("Time asleep")).toBeInTheDocument();
      expect(screen.getByText("Resting heart rate")).toBeInTheDocument();
    });
  });

  it("shows an empty state when nothing is recorded", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve([]));
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText(/No changes recorded yet/i)).toBeInTheDocument(),
    );
  });

  it("can add a change, and hides the end-date field for a one-off moment", async () => {
    renderScreen();
    await waitFor(() => screen.getByText("Eight Sleep Pod"));

    fireEvent.click(screen.getByText("Add change"));
    expect(screen.getByLabelText(/Ended on/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Shape"), {
      target: { value: "event" },
    });
    // An event is a point in time — offering an end date would invite a
    // request the server is going to reject.
    expect(screen.queryByLabelText(/Ended on/i)).toBeNull();
  });
});
