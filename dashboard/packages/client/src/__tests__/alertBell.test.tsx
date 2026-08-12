import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AlertBell } from "../components/AlertBell";
import type { AlertsResponse } from "@health-dashboard/shared";
import { MemoryRouter } from "react-router-dom";

const apiFetchMock = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (path: string, opts?: RequestInit) => apiFetchMock(path, opts),
}));

function renderBell() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AlertBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SAMPLE: AlertsResponse = {
  unreadCount: 2,
  openCount: 2,
  alerts: [
    {
      id: 2,
      kind: "illness_triad",
      severity: "alert",
      title: "Possible illness or under-recovery",
      detail: "resting HR, breathing rate elevated for 2+ days.",
      metric: "recovery",
      date: "2026-05-28",
      createdAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString(),
      resolvedAt: null,
      occurrenceCount: 1,
      readAt: null,
    },
    {
      id: 1,
      kind: "readiness_drop",
      severity: "warn",
      title: "Readiness has dropped",
      detail: "Today's readiness is 38 (was averaging 64).",
      metric: "readiness",
      date: "2026-05-28",
      createdAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString(),
      resolvedAt: null,
      occurrenceCount: 1,
      readAt: null,
    },
  ],
};

describe("AlertBell", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("shows an unread badge with the count", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve(SAMPLE));
    renderBell();
    await waitFor(() =>
      expect(screen.getByTestId("alert-badge")).toHaveTextContent("2"),
    );
  });

  it("opens a dropdown listing the alerts and marks them read", async () => {
    apiFetchMock.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === "/alerts/read-all" && opts?.method === "POST") {
        return Promise.resolve({ updated: 2 });
      }
      if (path === "/alerts?limit=8") return Promise.resolve(SAMPLE);
      return Promise.resolve(SAMPLE);
    });
    renderBell();

    await waitFor(() => screen.getByTestId("alert-badge"));
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));

    const menu = await screen.findByRole("dialog", { name: /notifications/i });
    expect(
      within(menu).getByText(/possible illness or under-recovery/i),
    ).toBeInTheDocument();
    expect(within(menu).getByText(/readiness has dropped/i)).toBeInTheDocument();

    // Opening acknowledges the unread alerts.
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/alerts/read-all",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("renders a calm empty state with no alerts", async () => {
    apiFetchMock.mockImplementation(() =>
      Promise.resolve({ alerts: [], unreadCount: 0 }),
    );
    renderBell();
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(
      await screen.findByText(/your recovery signals look normal/i),
    ).toBeInTheDocument();
    // No badge when nothing is unread.
    expect(screen.queryByTestId("alert-badge")).not.toBeInTheDocument();
  });

  it("does not crash when the endpoint returns an unexpected shape", async () => {
    // Defensive: blanket [] mocks (used by Layout-rendering tests) must
    // not break the bell.
    apiFetchMock.mockImplementation(() => Promise.resolve([]));
    renderBell();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /notifications/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("alert-badge")).not.toBeInTheDocument();
  });
});
