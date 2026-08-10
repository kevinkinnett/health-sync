import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestOverview } from "@health-dashboard/shared";
import { Ingest } from "../pages/Ingest";

const useIngestOverviewMock = vi.fn();

vi.mock("../api/queries", () => ({
  useIngestOverview: () => useIngestOverviewMock(),
  useHealthCheck: () => ({
    data: { dbConnected: true },
    isLoading: false,
    isError: false,
  }),
  useTriggerIngest: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
  }),
}));

function overview(status: "healthy" | "stale" | "unknown"): IngestOverview {
  return {
    status: {
      provenance: {
        device: "fitbit",
        deviceLabel: "Fitbit device",
        provider: "google_health",
        providerLabel: "Google Health",
      },
      freshness: {
        status,
        lastSuccessAtUtc:
          status === "unknown" ? null : "2026-08-09T16:30:00.000Z",
        expectedIntervalMinutes: 240,
        staleAfterMinutes: 300,
      },
    },
    state: [],
    runs: [],
    windmillConnected: true,
    activeJobs: [],
    completedJobs: [],
    schedules: [],
  };
}

describe("ingest freshness warning", () => {
  beforeEach(() => useIngestOverviewMock.mockReset());

  it("warns when a scheduled Google Health window has been missed", () => {
    useIngestOverviewMock.mockReturnValue({
      data: overview("stale"),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<Ingest />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Google Health sync overdue",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Fitbit device data arrives through Google Health",
    );
  });

  it("stays quiet while the provider is inside its freshness window", () => {
    useIngestOverviewMock.mockReturnValue({
      data: overview("healthy"),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    render(<Ingest />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
