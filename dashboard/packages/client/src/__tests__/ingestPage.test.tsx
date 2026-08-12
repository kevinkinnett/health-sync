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
      pipelineKey: "google-health",
      pipelineLabel: "Google Health Sync",
      pipelineCategory: "source",
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
      pipelineKey: "google-health",
      pipelineLabel: "Google Health Sync",
      pipelineCategory: "source",
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
      pipelineKey: "google-health",
      pipelineLabel: "Google Health Sync",
      pipelineCategory: "source",
      path: "f/u/ingest_google_health",
      schedule: "0 0 */4 * * *",
      timezone: "UTC",
      enabled: true,
      scriptPath: "f/u/ingest_google_health",
      nextExecution: "2026-08-11T20:00:00Z",
      summary: "Google Health import",
      description: null,
      triggerable: true,
    },
    {
      pipelineKey: "weekly-health-report",
      pipelineLabel: "Weekly AI Health Report",
      pipelineCategory: "analysis",
      path: "u/kevin/weekly_health_report",
      schedule: "0 0 13 * * 1",
      timezone: "UTC",
      enabled: true,
      scriptPath: "u/kevin/weekly_health_report",
      nextExecution: "2026-08-17T13:00:00Z",
      summary: "Weekly AI health report (Mondays)",
      description: null,
      triggerable: false,
    },
    {
      pipelineKey: "health-alerts",
      pipelineLabel: "Health Alert Evaluation",
      pipelineCategory: "notification",
      path: "u/kevin/evaluate_health_alerts_daily",
      schedule: "0 15 */2 * * *",
      timezone: "UTC",
      enabled: true,
      scriptPath: "u/kevin/evaluate_health_alerts",
      nextExecution: "2026-08-11T18:15:00Z",
      summary: "Health and ingestion-alert evaluation every 2 hours",
      description: null,
      triggerable: false,
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

    expect(await screen.findByText("Data & Analysis Pipeline")).toBeVisible();
    expect(screen.getByText(/1 running · 0 scheduled · 0 queued/i)).toBeVisible();
    expect(screen.getByText(/Every 4 hours · UTC/)).toBeVisible();
    expect(screen.getByText("Derived analytics")).toBeVisible();
    expect(screen.getByText("Notifications")).toBeVisible();
    expect(screen.getByText("Weekly AI Health Report")).toBeVisible();
    expect(screen.getByText("Health Alert Evaluation")).toBeVisible();
    expect(screen.getAllByText("Managed in Windmill")).toHaveLength(2);
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

    await screen.findByText("Data & Analysis Pipeline");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByText(/refresh failed\. showing the last pipeline status/i),
    ).toBeVisible();
    expect(screen.getAllByText("Google Health Sync")[0]).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled(),
    );
  });
});
