import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Medications } from "../pages/Medications";

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
      <MemoryRouter initialEntries={["/medications"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/medications" element={<Medications />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
});

describe("Medications page", () => {
  it("renders the page header and Log/Library tab buttons", async () => {
    apiFetch.mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByRole("heading", { name: /medications/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument();
  });

  it("shows the medication library when Library tab is clicked", async () => {
    apiFetch.mockResolvedValue([]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(
      await screen.findByRole("button", { name: /add medication/i }),
    ).toBeInTheDocument();
  });

  it("renders quick-log cards for active medications and opens the confirm sheet on click", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/medications/items")) {
        return Promise.resolve([
          {
            id: 1,
            name: "Lisinopril",
            brand: "Prinivil",
            form: "tablet",
            defaultAmount: 10,
            defaultUnit: "mg",
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

    const card = await screen.findByRole("button", { name: /lisinopril/i });
    fireEvent.click(card);

    expect(
      await screen.findByRole("heading", { name: /logging lisinopril/i }),
    ).toBeInTheDocument();
    const amountInput = screen.getByLabelText(/amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe("10");
    const unitInput = screen.getByLabelText(/^unit$/i) as HTMLInputElement;
    expect(unitInput.value).toBe("mg");
  });

  it("submits a POST to /medications/intakes with the right body when confirmed", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/medications/intakes" && init?.method === "POST") {
        return Promise.resolve({
          id: 100,
          itemId: 1,
          itemName: "Lisinopril",
          takenAt: new Date().toISOString(),
          amount: 10,
          unit: "mg",
          notes: null,
          createdAt: new Date().toISOString(),
        });
      }
      if (path.startsWith("/medications/items")) {
        return Promise.resolve([
          {
            id: 1,
            name: "Lisinopril",
            brand: null,
            form: null,
            defaultAmount: 10,
            defaultUnit: "mg",
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

    const card = await screen.findByRole("button", { name: /lisinopril/i });
    fireEvent.click(card);

    fireEvent.click(await screen.findByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      const postCall = apiFetch.mock.calls.find(
        ([p, init]) => p === "/medications/intakes" && init?.method === "POST",
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body);
      expect(body.itemId).toBe(1);
      expect(body.amount).toBe(10);
      expect(body.unit).toBe("mg");
    });
  });
});
