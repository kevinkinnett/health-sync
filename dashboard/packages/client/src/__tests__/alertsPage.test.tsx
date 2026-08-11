import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alerts } from "../pages/Alerts";

const apiFetchMock = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (path: string, options?: RequestInit) => apiFetchMock(path, options),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Alerts />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Alert history", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      unreadCount: 2,
      alerts: [
        {
          id: 2,
          kind: "ingest_stale",
          severity: "warn",
          title: "Google Health sync is late",
          detail: "No successful run arrived in the expected window.",
          metric: "ingestion",
          date: "2026-08-11",
          createdAt: "2026-08-11T12:00:00Z",
          readAt: null,
        },
        {
          id: 1,
          kind: "readiness_drop",
          severity: "warn",
          title: "Readiness has dropped",
          detail: "Readiness is below its recent range.",
          metric: "readiness",
          date: "2026-08-10",
          createdAt: "2026-08-10T12:00:00Z",
          readAt: null,
        },
      ],
    });
  });

  it("shows durable events with the relevant next action", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Alert history" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open data pipeline/i })).toHaveAttribute("href", "/ingest");
    expect(screen.getByRole("link", { name: /review readiness/i })).toHaveAttribute("href", "/readiness");
    expect(apiFetchMock).toHaveBeenCalledWith("/alerts?limit=200", undefined);
  });

  it("filters operational incidents from health signals", async () => {
    renderPage();
    await screen.findByText("Google Health sync is late");

    fireEvent.click(screen.getByRole("button", { name: /pipeline/i }));
    await waitFor(() => {
      expect(screen.getByText("Google Health sync is late")).toBeInTheDocument();
      expect(screen.queryByText("Readiness has dropped")).not.toBeInTheDocument();
    });
  });
});
