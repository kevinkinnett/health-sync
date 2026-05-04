import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ApiConsole } from "../pages/ApiConsole";

const apiFetchMock = vi.fn();

vi.mock("../api/client", () => ({
  apiFetch: (path: string) => apiFetchMock(path),
}));

function statsResponse(windowHours: number) {
  // Return progressively richer numbers for the longer window so tests
  // can tell the 24h tile and the 7d table apart.
  return {
    windowHours,
    totalCalls: windowHours === 24 ? 142 : 980,
    uniqueCallers: windowHours === 24 ? 3 : 5,
    avgDurationMs: windowHours === 24 ? 87 : 95,
    p95DurationMs: windowHours === 24 ? 230 : 280,
    errorCount: windowHours === 24 ? 2 : 9,
    errorRate: windowHours === 24 ? 2 / 142 : 9 / 980,
    byCaller: [
      { caller: "my-script", count: 80 },
      { caller: null, count: 50 },
    ],
    byPath: [
      { path: "/summary", count: windowHours === 24 ? 60 : 410, avgDurationMs: 42 },
      { path: "/activity", count: windowHours === 24 ? 30 : 220, avgDurationMs: 88 },
      { path: "/records", count: windowHours === 24 ? 12 : 80, avgDurationMs: 33 },
    ],
  };
}

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
        const m = path.match(/windowHours=(\d+)/);
        const hours = m ? parseInt(m[1], 10) : 24;
        return Promise.resolve(statsResponse(hours));
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

  it("Quick Start card renders 3 panels (Base URL + Swagger UI + OpenAPI JSON)", () => {
    renderConsole();
    // Section heading + the three panel labels
    expect(screen.getByText("Quick Start")).toBeInTheDocument();
    expect(screen.getByText(/^Base URL$/)).toBeInTheDocument();
    expect(screen.getByText(/Interactive docs/i)).toBeInTheDocument();
    expect(screen.getByText(/OpenAPI spec/i)).toBeInTheDocument();
    // Each external panel exposes a working link
    expect(
      screen.getByRole("link", { name: /api\/v1\/docs/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /openapi\.json/i }),
    ).toBeInTheDocument();
  });

  it("renders the helper line with an X-Caller code pill", () => {
    renderConsole();
    // "X-Caller" lives inside a <code> pill — assert by tag for clarity
    const code = screen.getByText("X-Caller");
    expect(code.tagName).toBe("CODE");
    // Surrounding helper text wording
    expect(screen.getByText(/Tailnet membership/i)).toBeInTheDocument();
  });

  it("renders 5 curl examples, each with a header row + copy button", () => {
    renderConsole();
    expect(screen.getByText(/Latest health snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/Activity over the last month/i)).toBeInTheDocument();
    expect(screen.getByText(/Personal records/i)).toBeInTheDocument();
    expect(screen.getByText(/Supplement → health correlations/i)).toBeInTheDocument();
    expect(screen.getByText(/Identify your script/i)).toBeInTheDocument();
    // 5 example copy buttons + 1 base-URL copy button = ≥6
    expect(
      screen.getAllByRole("button", { name: /Copy/i }).length,
    ).toBeGreaterThanOrEqual(6);
  });

  it("includes a 'Swagger UI →' corner link in the page header", () => {
    renderConsole();
    // Two links to /api/v1/docs exist (Quick Start panel + corner) —
    // the corner link is identified by its visible text label.
    const corner = screen.getByRole("link", { name: /Swagger UI →/ });
    expect(corner).toHaveAttribute("href", "/api/v1/docs");
  });

  it("populates the 24h stat tiles from /admin/api-logs/stats", async () => {
    renderConsole();
    await waitFor(() => {
      expect(screen.getByText("142")).toBeInTheDocument(); // 24h calls
      expect(screen.getByText("87 ms")).toBeInTheDocument(); // avg response
      expect(screen.getByText(/p95 230 ms/i)).toBeInTheDocument();
      // top-caller annotation in the Unique callers tile
      expect(screen.getByText(/top: my-script/)).toBeInTheDocument();
      // error rate
      expect(screen.getByText("1.4%")).toBeInTheDocument(); // 2/142
    });
  });

  it("renders the Endpoints (7d) table from byPath", async () => {
    renderConsole();
    await waitFor(() => {
      const table = screen.getByText(/Endpoints \(7d\)/i).closest("section");
      expect(table).not.toBeNull();
      const within7d = within(table as HTMLElement);
      // The 7d numbers (not the 24h ones) should appear in the table.
      expect(within7d.getByText("/summary")).toBeInTheDocument();
      expect(within7d.getByText("/activity")).toBeInTheDocument();
      expect(within7d.getByText("410")).toBeInTheDocument(); // 7d call count
      expect(within7d.getByText("220")).toBeInTheDocument();
    });
  });

  it("renders the recent-requests table with status colour coding", async () => {
    renderConsole();
    await waitFor(() => {
      expect(screen.getByText("200")).toBeInTheDocument();
      expect(screen.getByText("500")).toBeInTheDocument();
      expect(screen.getByText(/GET \/summary/)).toBeInTheDocument();
      expect(screen.getByText(/GET \/records/)).toBeInTheDocument();
    });
  });

  it("re-queries /recent with the caller param when the filter changes", async () => {
    renderConsole();
    await waitFor(() =>
      expect(screen.getByText(/GET \/summary/)).toBeInTheDocument(),
    );
    apiFetchMock.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/filter by caller/i), {
      target: { value: "my-script" },
    });
    await waitFor(() => {
      expect(
        apiFetchMock.mock.calls.some((c) =>
          String(c[0]).includes("caller=my-script"),
        ),
      ).toBe(true);
    });
  });

  it("Load more button shows up when the recent table is full", async () => {
    // Override the recent mock to return exactly limit=50 rows, which
    // is the threshold for showing the load-more button.
    apiFetchMock.mockImplementation((path: string) => {
      if (path.startsWith("/admin/api-logs/stats")) {
        const m = path.match(/windowHours=(\d+)/);
        const hours = m ? parseInt(m[1], 10) : 24;
        return Promise.resolve(statsResponse(hours));
      }
      if (path.startsWith("/admin/api-logs/recent")) {
        const limitMatch = path.match(/limit=(\d+)/);
        const limit = limitMatch ? parseInt(limitMatch[1], 10) : 50;
        return Promise.resolve(
          Array.from({ length: limit }).map((_, i) => ({
            id: i + 1,
            caller: "my-script",
            method: "GET",
            path: "/summary",
            statusCode: 200,
            durationMs: 42,
            requestParams: null,
            error: null,
            createdAt: new Date().toISOString(),
          })),
        );
      }
      return Promise.resolve(null);
    });

    renderConsole();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /load more/i }),
      ).toBeInTheDocument(),
    );

    apiFetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => {
      // Bumping the limit triggers a refetch with limit=100
      expect(
        apiFetchMock.mock.calls.some((c) =>
          String(c[0]).includes("limit=100"),
        ),
      ).toBe(true);
    });
  });
});
