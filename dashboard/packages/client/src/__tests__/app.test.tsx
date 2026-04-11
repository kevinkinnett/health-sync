import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Routes, Route } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Dashboard } from "../pages/Dashboard";
import { Explore } from "../pages/Explore";
import { Ingest } from "../pages/Ingest";

// Mock all API calls to return empty/loading states
vi.mock("../api/client", () => ({
  apiFetch: vi.fn(() => Promise.resolve([])),
}));


function renderWithProviders(initialRoute = "/") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/ingest" element={<Ingest />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App routing and layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the nav bar with all navigation links", () => {
    renderWithProviders();
    expect(screen.getByText("VITALIS")).toBeInTheDocument();
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Analytics").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Data Pipeline").length).toBeGreaterThanOrEqual(1);
  });

  it("renders date range presets in the nav", () => {
    renderWithProviders();
    expect(screen.getByText("7D")).toBeInTheDocument();
    expect(screen.getByText("30D")).toBeInTheDocument();
    expect(screen.getByText("90D")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("renders Dashboard page at /", () => {
    renderWithProviders("/");
    // Dashboard shows loading state while queries resolve
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders Explore page at /explore", () => {
    renderWithProviders("/explore");
    // Explore page has tab buttons
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Sleep")).toBeInTheDocument();
    expect(screen.getByText("Heart Rate")).toBeInTheDocument();
  });

  it("renders Ingest page at /ingest", () => {
    renderWithProviders("/ingest");
    expect(screen.getByText("Pipeline Status")).toBeInTheDocument();
    expect(screen.getByText("Backfill Progress by Data Type")).toBeInTheDocument();
  });
});
