import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Supplements } from "../pages/Supplements";

// Mock the API client; default empty arrays for list calls.
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
      <MemoryRouter initialEntries={["/supplements"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/supplements" element={<Supplements />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("Supplements page", () => {
  it("renders the page header and Log/Library tab buttons", async () => {
    apiFetch.mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByRole("heading", { name: /supplements/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
  });

  it("shows the supplement library when Library tab is clicked", async () => {
    apiFetch.mockResolvedValue([]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(
      await screen.findByRole("button", { name: /add supplement/i }),
    ).toBeInTheDocument();
  });

  it("renders quick-log cards for active supplements and opens the confirm sheet on click", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/supplements/items")) {
        return Promise.resolve([
          {
            id: 1,
            name: "Vitamin D3",
            brand: "Now Foods",
            form: "capsule",
            defaultAmount: 1000,
            defaultUnit: "IU",
            notes: null,
            isActive: true,
            createdAt: "2026-04-26T00:00:00Z",
            updatedAt: "2026-04-26T00:00:00Z",
          },
        ]);
      }
      // intakes
      return Promise.resolve([]);
    });
    renderPage();

    // Wait for the quick-log card to appear and tap it.
    const card = await screen.findByRole("button", { name: /vitamin d3/i });
    fireEvent.click(card);

    // Confirm sheet appears with default amount pre-filled.
    expect(
      await screen.findByRole("heading", { name: /logging vitamin d3/i }),
    ).toBeInTheDocument();
    const amountInput = screen.getByLabelText(/amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe("1000");
    const unitInput = screen.getByLabelText(/^unit$/i) as HTMLInputElement;
    expect(unitInput.value).toBe("IU");
  });

  it("submits a POST to /supplements/intakes with the right body when confirmed", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/supplements/intakes" && init?.method === "POST") {
        return Promise.resolve({
          id: 100,
          itemId: 1,
          itemName: "Vitamin D3",
          takenAt: new Date().toISOString(),
          amount: 1000,
          unit: "IU",
          notes: null,
          createdAt: new Date().toISOString(),
        });
      }
      if (path.startsWith("/supplements/items")) {
        return Promise.resolve([
          {
            id: 1,
            name: "Vitamin D3",
            brand: null,
            form: null,
            defaultAmount: 1000,
            defaultUnit: "IU",
            notes: null,
            isActive: true,
            createdAt: "2026-04-26T00:00:00Z",
            updatedAt: "2026-04-26T00:00:00Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });
    renderPage();

    const card = await screen.findByRole("button", { name: /vitamin d3/i });
    fireEvent.click(card);

    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      const postCall = apiFetch.mock.calls.find(
        ([p, init]) => p === "/supplements/intakes" && init?.method === "POST",
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body);
      expect(body.itemId).toBe(1);
      expect(body.amount).toBe(1000);
      expect(body.unit).toBe("IU");
    });
  });
});
