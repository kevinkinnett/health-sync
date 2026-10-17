import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { HealthSummary, Intervention, WeeklyInsights as WeeklyInsightsData } from "@health-dashboard/shared";
import { WeeklyInsights } from "../components/WeeklyInsights";
import { RouteErrorBoundary } from "../components/RouteErrorBoundary";
import { Layout } from "../components/Layout";
import { Insights } from "../pages/Insights";
import { Timeline } from "../pages/Timeline";
import { Readiness } from "../pages/Readiness";
import { Recovery } from "../pages/Recovery";
import { GoalRings } from "../components/GoalRings";
import { DayOfWeekHeatmap } from "../components/DayOfWeekHeatmap";
import { MAGNITUDE_RAMP_3 } from "../components/charts/chartPalette";
import { contrastRatio, heatmapBucket, inkFor } from "../lib/heatmapScale";
import { tdDateClass, thClass } from "../components/DataTable";

/**
 * Regression tests for the UX-audit findings: each block pins the
 * user-visible behaviour the audit found broken.
 */

type Handler = (path: string, init?: RequestInit) => Promise<unknown>;
let handler: Handler = () => Promise.resolve([]);
vi.mock("../api/client", () => ({
  apiFetch: (path: string, init?: RequestInit) => handler(path, init),
}));

function wrap(ui: ReactNode, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  handler = () => Promise.resolve([]);
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Weekly Insights: direction follows the raw change, tone follows better/worse
// ---------------------------------------------------------------------------

const WEEKLY: WeeklyInsightsData = {
  currentPeriod: { start: "2026-07-20", end: "2026-07-26" },
  previousPeriod: { start: "2026-07-13", end: "2026-07-19" },
  steps: { current: 8000, previous: 7000, changePercent: 14 },
  activeMinutes: { current: 30, previous: 30, changePercent: 0 },
  distance: { current: 5, previous: 5, changePercent: 0 },
  calories: { current: 2000, previous: 2000, changePercent: 0 },
  sleep: { current: 400, previous: 440, changePercent: -9 },
  sleepEfficiency: null,
  restingHr: { current: 65, previous: 66, changePercent: -2 },
  dayOfWeek: [],
  dayOfWeekDays: 0,
  highlights: [],
} as unknown as WeeklyInsightsData;

describe("Weekly Insights change arrows", () => {
  function arrowFor(label: string) {
    const card = screen.getByText(label).parentElement!;
    return within(card).getByTestId("change-arrow");
  }

  it("points a falling resting HR DOWN and marks it as better", () => {
    render(<WeeklyInsights data={WEEKLY} />);
    const rhr = arrowFor("Resting HR");
    expect(rhr.dataset.direction).toBe("down");
    expect(rhr.dataset.tone).toBe("better");
    expect(rhr).toHaveTextContent("arrow_downward");
    expect(rhr).toHaveTextContent("Down 2% from last week (better)");
    expect(rhr.className).toContain("text-secondary");
  });

  it("marks a rising resting HR as worse while still pointing up", () => {
    render(<WeeklyInsights data={{ ...WEEKLY, restingHr: { current: 68, previous: 65, changePercent: 5 } }} />);
    const rhr = arrowFor("Resting HR");
    expect(rhr.dataset.direction).toBe("up");
    expect(rhr.dataset.tone).toBe("worse");
    expect(rhr.className).toContain("text-error");
  });

  it("keeps higher-is-better metrics unchanged: steps up = better, sleep down = worse", () => {
    render(<WeeklyInsights data={WEEKLY} />);
    const steps = arrowFor("Avg Daily Steps");
    expect([steps.dataset.direction, steps.dataset.tone]).toEqual(["up", "better"]);
    const sleep = arrowFor("Sleep Duration");
    expect([sleep.dataset.direction, sleep.dataset.tone]).toEqual(["down", "worse"]);
  });
});

// ---------------------------------------------------------------------------
// Error boundary: one broken screen keeps the shell and offers retry
// ---------------------------------------------------------------------------

describe("RouteErrorBoundary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => consoleError.mockRestore());

  it("renders a retry card in place of a crashing screen and recovers on retry", () => {
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error("Cannot read properties of undefined (reading '0')");
      return <p>Recovered screen</p>;
    }
    wrap(
      <>
        <nav aria-label="Primary"><Link to="/other">Other</Link></nav>
        <RouteErrorBoundary><Flaky /></RouteErrorBoundary>
      </>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This screen couldn’t be displayed");
    expect(alert).toHaveTextContent("reading '0'");
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Recovered screen")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the Layout shell (nav) mounted when a route throws, and resets on navigation", async () => {
    function Boom(): ReactNode {
      throw new Error("bad payload");
    }
    wrap(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Boom />} />
          <Route path="/readiness" element={<p>Readiness screen</p>} />
        </Route>
      </Routes>,
    );
    expect(await screen.findByText("This screen couldn’t be displayed")).toBeInTheDocument();
    expect(screen.getByText("VITALIS")).toBeInTheDocument();
    const navLinks = screen.getAllByRole("link", { name: /readiness/i });
    fireEvent.click(navLinks[0]);
    expect(await screen.findByText("Readiness screen")).toBeInTheDocument();
    expect(screen.queryByText("This screen couldn’t be displayed")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AI Insights: start failures are shown, and the empty-state CTA can't double-start
// ---------------------------------------------------------------------------

describe("AI Insights generation start", () => {
  it("shows an alert when starting a generation fails", async () => {
    handler = (path) => {
      if (path === "/insights/list") return Promise.resolve([]);
      if (path === "/insights/generate") return Promise.reject(new Error("API error 502"));
      return Promise.resolve(null);
    };
    wrap(<Insights />);
    fireEvent.click(await screen.findByRole("button", { name: /generate first analysis/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t start the analysis.");
    expect(alert).toHaveTextContent("API error 502");
    // Button is usable again for a retry.
    expect(screen.getByRole("button", { name: /generate first analysis/i })).not.toBeDisabled();
  });

  it("a double-click on Generate First Analysis sends exactly one POST", async () => {
    let resolveStart: (v: unknown) => void = () => {};
    const posts: string[] = [];
    handler = (path) => {
      if (path === "/insights/list") return Promise.resolve([]);
      if (path === "/insights/generate") {
        posts.push(path);
        return new Promise((r) => { resolveStart = r; });
      }
      if (path.startsWith("/insights/generate/status/")) return new Promise(() => {});
      return Promise.resolve(null);
    };
    wrap(<Insights />);
    const button = await screen.findByRole("button", { name: /generate first analysis/i });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: /starting/i })).toBeDisabled());
    resolveStart({ jobId: "job-1" });
    // Still disabled while waiting for the first status poll.
    await waitFor(() => expect(localStorage.getItem("vitalis.insights.job")).toContain("job-1"));
    expect(screen.getByRole("button", { name: /starting/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /starting/i }));
    expect(posts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Weekday heatmap: validated ramp, contrast-correct labels
// ---------------------------------------------------------------------------

describe("DayOfWeekHeatmap colour", () => {
  it("every ramp step has a label ink at ≥ 4.5:1", () => {
    for (const fill of MAGNITUDE_RAMP_3) {
      expect(contrastRatio(fill, inkFor(fill))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("bins normalised values onto the ramp, top value on the lightest step", () => {
    expect(heatmapBucket(0)).toBe(0);
    expect(heatmapBucket(0.5)).toBe(1);
    expect(heatmapBucket(1)).toBe(MAGNITUDE_RAMP_3.length - 1);
  });

  it("renders cells only on ramp colours with no retired pastel", () => {
    const { container } = render(
      <DayOfWeekHeatmap
        data={{
          dayNames: ["Mon", "Tue", "Wed"],
          dayDates: [],
          rows: [{ metric: "steps", label: "Steps", unit: "", values: [5017, 5991, 7607], min: 5017, max: 7607 }],
          totalDays: 21,
          dayCounts: [3, 3, 3],
        }}
      />,
    );
    const peak = screen.getByTitle(/Steps weekday average: 7,607/);
    // jsdom normalises inline colours to rgb().
    expect(peak.style.backgroundColor).toBe("rgb(134, 182, 239)"); // #86b6ef
    expect(peak.style.color).toBe("rgb(7, 16, 28)"); // dark ink on the light step
    const low = screen.getByTitle(/Steps weekday average: 5,017/);
    expect(low.style.color).toBe("rgb(241, 243, 245)");
    expect(container.innerHTML).not.toMatch(/192, 193, 255|78, 222, 163|255, 178, 183/);
    expect(screen.getByLabelText(/shading runs from lower to higher/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Timeline: delete asks first and has a real target
// ---------------------------------------------------------------------------

const CHANGE: Intervention = {
  id: 1, kind: "period", category: "device", name: "Eight Sleep Pod",
  startedOn: "2026-05-02", endedOn: null, source: "manual", sourceRef: null, detail: null,
  createdAt: "2026-05-02T00:00:00.000Z", updatedAt: "2026-05-02T00:00:00.000Z",
};

describe("Timeline delete", () => {
  it("does not DELETE on the first tap; confirm does, Keep cancels", async () => {
    const deletes: string[] = [];
    handler = (path, init) => {
      if (init?.method === "DELETE") { deletes.push(path); return Promise.resolve(undefined); }
      if (path.startsWith("/interventions")) return Promise.resolve([CHANGE]);
      if (path === "/config") return Promise.resolve({ userTimezone: "America/New_York" });
      return Promise.resolve([]);
    };
    wrap(<Timeline />, "/timeline");
    const del = await screen.findByLabelText("Delete Eight Sleep Pod");
    expect(del.className).toMatch(/\bh-10\b/);
    expect(del.className).toMatch(/\bw-10\b/);

    fireEvent.click(del);
    expect(deletes).toHaveLength(0);
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByText(/This cannot be undone/)).toBeNull();
    expect(deletes).toHaveLength(0);

    fireEvent.click(del);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deletes).toEqual(["/interventions/1"]));
  });
});

// ---------------------------------------------------------------------------
// Readiness: an API failure is an error with Retry, not "not enough data"
// ---------------------------------------------------------------------------

describe("Readiness states", () => {
  it("shows an error with Retry when the request fails", async () => {
    handler = (path) =>
      path.startsWith("/health/readiness") ? Promise.reject(new Error("API error 500")) : Promise.resolve([]);
    wrap(<Readiness />, "/readiness");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("API error 500");
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText(/keep syncing/)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Readiness" })).toBeInTheDocument();
  });

  it("keeps the insufficient-data message for a genuine null score", async () => {
    handler = (path) =>
      path.startsWith("/health/readiness")
        ? Promise.resolve({ score: null, band: "insufficient", summary: "", components: [], history: [] })
        : Promise.resolve([]);
    wrap(<Readiness />, "/readiness");
    expect(await screen.findByText(/Not enough data to compute readiness yet/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Daily Goals edit button, DataTable cells, Recovery empty Quick log
// ---------------------------------------------------------------------------

describe("Daily Goals edit button", () => {
  it("has an accessible name, expanded state and a 44px target", () => {
    const summary = {
      activity: { latest: null, sparkline: [] },
      sleep: { latest: null, sparkline: [] },
      heartRate: { latest: null, sparkline: [] },
      weight: { latest: null, sparkline: [] },
    } as unknown as HealthSummary;
    render(<GoalRings summary={summary} />);
    const button = screen.getByRole("button", { name: "Edit daily goals" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button.className).toMatch(/\bh-11\b/);
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
  });
});

describe("DataTable date column", () => {
  it("never wraps and stays pinned while numbers scroll", () => {
    expect(tdDateClass).toContain("whitespace-nowrap");
    expect(tdDateClass).toContain("sticky");
    expect(thClass).toContain("whitespace-nowrap");
  });
});

describe("Recovery empty Quick log", () => {
  it("offers a path to add the first activity instead of an empty grid", async () => {
    handler = (path) => {
      if (path === "/config") return Promise.resolve({ userTimezone: "America/New_York" });
      return Promise.resolve([]);
    };
    wrap(<Recovery />, "/recovery");
    fireEvent.click(await screen.findByRole("button", { name: "Add your first activity" }));
    expect(screen.getByRole("heading", { name: "Add recovery activity" })).toBeInTheDocument();
    expect(screen.getByLabelText("Activity name")).toBeInTheDocument();
  });
});
