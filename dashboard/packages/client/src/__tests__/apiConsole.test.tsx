import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ApiConsole } from "../pages/ApiConsole";

const apiFetchMock = vi.fn();

vi.mock("../api/client", () => ({
  apiFetch: (path: string) => apiFetchMock(path),
}));

function renderConsole() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ApiConsole />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ApiConsole page", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("/admin/api-logs/stats")) {
        return Promise.resolve({
          windowHours: 24,
          totalCalls: 142,
          uniqueCallers: 3,
          avgDurationMs: 87,
          p95DurationMs: 230,
          errorCount: 2,
          errorRate: 2 / 142,
          byCaller: [
            { caller: "my-script", count: 80 },
            { caller: null, count: 50 },
          ],
          byPath: [],
        });
      }
      if (path.startsWith("/admin/api-logs/recent")) {
        return Promise.resolve([
          {
            id: 1,
            caller: "my-script",
            method: "GET",
            path: "/summary",
            statusCode: 200,
            durationMs: 42,
            requestParams: null,
            error: null,
            createdAt: new Date().toISOString(),
          },
          {
            id: 2,
            caller: null,
            method: "GET",
            path: "/records",
            statusCode: 500,
            durationMs: 13,
            requestParams: null,
            error: "boom",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      return Promise.resolve(null);
    });
  });

  it("renders the base URL, Swagger and OpenAPI doc links", () => {
    renderConsole();
    // "Base URL" appears in both the section heading and the small
    // label — use getAllBy and just assert there's at least one.
    expect(screen.getAllByText(/Base URL/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /api\/v1\/docs/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /openapi\.json/i })).toBeInTheDocument();
  });

  it("renders Quick Start curl examples with copy buttons", () => {
    renderConsole();
    expect(screen.getByText(/Latest health snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/Identify your script/i)).toBeInTheDocument();
    // One copy button per example + one for the base URL.
    expect(
      screen.getAllByRole("button", { name: /copy command/i }).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it("populates the stat tiles from the live stats endpoint", async () => {
    renderConsole();
    await waitFor(() => {
      expect(screen.getByText("142")).toBeInTheDocument(); // total calls
      expect(screen.getByText("87 ms")).toBeInTheDocument(); // avg latency
      expect(screen.getByText(/p95 230 ms/i)).toBeInTheDocument();
      // "my-script" also appears in the recent-calls table row, so just
      // check ≥1 occurrence (the top-caller tile is one of them).
      expect(screen.getAllByText("my-script").length).toBeGreaterThan(0);
    });
  });

  it("renders the recent-requests table with status colors", async () => {
    renderConsole();
    await waitFor(() => {
      expect(screen.getByText("200")).toBeInTheDocument();
      expect(screen.getByText("500")).toBeInTheDocument();
      // Path appears alongside the method in the row.
      expect(screen.getByText(/GET \/summary/)).toBeInTheDocument();
      expect(screen.getByText(/GET \/records/)).toBeInTheDocument();
    });
  });

  it("filters the recent calls when the caller filter changes", async () => {
    renderConsole();
    await waitFor(() => {
      expect(screen.getByText(/GET \/summary/)).toBeInTheDocument();
    });
    apiFetchMock.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/filter by caller/i), {
      target: { value: "my-script" },
    });
    await waitFor(() => {
      // The recent endpoint should be re-queried with the caller param.
      expect(
        apiFetchMock.mock.calls.some((call) =>
          String(call[0]).includes("caller=my-script"),
        ),
      ).toBe(true);
    });
  });
});
