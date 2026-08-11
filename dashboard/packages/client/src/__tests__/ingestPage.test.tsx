import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IngestOverview } from "@health-dashboard/shared";
import { Ingest } from "../pages/Ingest";

const apiFetch = vi.fn();

vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Ingest />
    </QueryClientProvider>,
  );
}

const startedAt = "2026-08-11T16:00:00Z";
const overview: IngestOverview = {
  status: {
    provenance: {
      device: "fitbit",
      deviceLabel: "Fitbit device",
      provider: "google_health",
      providerLabel: "Google Health",
    },
    freshness: {
      status: "healthy",
      lastSuccessAtUtc: startedAt,
      expectedIntervalMinutes: 240,
      staleAfterMinutes: 300,
    },
  },
  state: [],
  runs: [
    {
      ingestRunId: 4,
      startedAtUtc: startedAt,
      finishedAtUtc: "2026-08-11T16:00:30Z",
      status: "completed",
      rowsWritten: 42,
      errorCount: 0,
      details: {
        activity: { rows: 42, errors: 0, range: "2026-08-10" },
      },
    },
  ],
  windmillConnected: true,
  activeJobs: [
    {
      id: "running-job-123",
      scriptPath: "f/u/ingest_google_health",
      createdAt: startedAt,
      startedAt,
      scheduledFor: null,
      running: true,
      schedulePath: "f/u/ingest_google_health",
    },
  ],
  completedJobs: [
    {
      id: "completed-job-123",
      scriptPath: "f/u/ingest_google_health",
      schedulePath: "f/u/ingest_google_health",
      createdAt: startedAt,
      startedAt,
      durationMs: 30_000,
      success: true,
      isSkipped: false,
    },
  ],
  schedules: [
    {
      path: "f/u/ingest_google_health",
      schedule: "0 0 */4 * * *",
      enabled: true,
      scriptPath: "f/u/ingest_google_health",
      nextExecution: "2026-08-11T20:00:00Z",
      summary: "Google Health import",
      description: null,
    },
  ],
};

beforeEach(() => apiFetch.mockReset());

describe("Ingest operational UI", () => {
  it("renders live job state, triggers the selected schedule, and expands run details", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/ingest/overview?limit=20") return Promise.resolve(overview);
      if (path === "/health-check") return Promise.resolve({ dbConnected: true });
      if (path === "/ingest/trigger" && init?.method === "POST") {
        return Promise.resolve({ jobId: "new-job-77", message: "started" });
      }
      return Promise.resolve({});
    });
    renderPage();

    expect(await screen.findByText("Pipeline Status")).toBeVisible();
    expect(screen.getByText(/1 running · 0 scheduled · 0 queued/i)).toBeVisible();
    expect(screen.getByText("Every 4 hours")).toBeVisible();
    expect(screen.queryByRole("button", { name: /view full log/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    expect(await screen.findByText("new-job-77")).toBeVisible();
    expect(apiFetch).toHaveBeenCalledWith("/ingest/trigger", { method: "POST" });

    const historyRow = screen.getByRole("button", {
      name: /completed-job-123/i,
    });
    expect(historyRow).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(historyRow);
    expect(historyRow).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("activity")).toBeVisible();
    expect(screen.getByText("rows").parentElement).toHaveTextContent("42 rows");
  });

  it("keeps cached pipeline data visible when a manual refresh fails", async () => {
    let overviewCalls = 0;
    apiFetch.mockImplementation((path: string) => {
      if (path === "/ingest/overview?limit=20") {
        overviewCalls += 1;
        return overviewCalls === 1
          ? Promise.resolve(overview)
          : Promise.reject(new Error("network down"));
      }
      if (path === "/health-check") return Promise.resolve({ dbConnected: true });
      return Promise.resolve({});
    });
    renderPage();

    await screen.findByText("Pipeline Status");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByText(/refresh failed\. showing the last pipeline status/i),
    ).toBeVisible();
    expect(screen.getByText("Google Health Sync")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled(),
    );
  });
});
