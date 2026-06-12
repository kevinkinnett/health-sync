import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MedicationCalendar } from "../components/medications/MedicationCalendar";
import type { MedicationItem } from "@health-dashboard/shared";

const apiFetch = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

// Freeze the clock mid-month so "future day" and month-label assertions are
// deterministic. Only Date is faked — timers stay real so waitFor works.
const FROZEN_NOW = new Date(2026, 5, 15, 14, 0, 0); // Mon Jun 15 2026, 2pm local

const ITEM: MedicationItem = {
  id: 1,
  name: "Escitalopram",
  brand: "generic",
  form: "tablet",
  defaultAmount: 10,
  defaultUnit: "mg",
  notes: null,
  isActive: true,
  createdAt: "2026-04-26T00:00:00Z",
  updatedAt: "2026-04-26T00:00:00Z",
};

function renderCalendar(items: MedicationItem[] = [ITEM]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MedicationCalendar items={items} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: FROZEN_NOW, toFake: ["Date"] });
  apiFetch.mockReset();
  apiFetch.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MedicationCalendar", () => {
  it("renders the current month with future days disabled and today enabled", async () => {
    renderCalendar();
    expect(await screen.findByText("June 2026")).toBeInTheDocument();
    // Jun 20 is in the future relative to the frozen Jun 15 clock.
    const future = screen.getByRole("button", { name: "Log Escitalopram on Jun 20" });
    expect(future).toBeDisabled();
    const today = screen.getByRole("button", { name: "Log Escitalopram on Jun 15" });
    expect(today).toBeEnabled();
  });

  it("logs an intake at 8am local when an empty past day is tapped (server fills default dose)", async () => {
    renderCalendar();
    const day = await screen.findByRole("button", { name: "Log Escitalopram on Jun 5" });
    fireEvent.click(day);

    await waitFor(() => {
      const post = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/intakes" &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as { body: string }).body);
      expect(body.itemId).toBe(1);
      expect(body.takenAt).toBe(new Date(2026, 5, 5, 8).toISOString());
      // amount/unit omitted — the server substitutes the item defaults.
      expect(body.amount).toBeUndefined();
      expect(body.unit).toBeUndefined();
    });
  });

  it("marks logged days and deletes the day's intake after confirmation", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.startsWith("/medications/intakes?") || path === "/medications/intakes") {
        if (init?.method === "POST") return Promise.resolve({});
        return Promise.resolve([
          {
            id: 55,
            itemId: 1,
            itemName: "Escitalopram",
            takenAt: new Date(2026, 5, 10, 8).toISOString(),
            amount: 10,
            unit: "mg",
            notes: null,
            createdAt: new Date(2026, 5, 10, 8).toISOString(),
          },
        ]);
      }
      return Promise.resolve([]);
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderCalendar();

    const logged = await screen.findByRole("button", {
      name: "Remove 1 intake of Escitalopram on Jun 10",
    });
    fireEvent.click(logged);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledOnce();
      const delCall = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/intakes/55" &&
          (init as RequestInit | undefined)?.method === "DELETE",
      );
      expect(delCall).toBeDefined();
    });
    confirmSpy.mockRestore();
  });

  it("does not delete when the confirmation is declined", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/medications/intakes")) {
        return Promise.resolve([
          {
            id: 55,
            itemId: 1,
            itemName: "Escitalopram",
            takenAt: new Date(2026, 5, 10, 8).toISOString(),
            amount: 10,
            unit: "mg",
            notes: null,
            createdAt: new Date(2026, 5, 10, 8).toISOString(),
          },
        ]);
      }
      return Promise.resolve([]);
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderCalendar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove 1 intake of Escitalopram on Jun 10",
      }),
    );

    expect(
      apiFetch.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBeUndefined();
    confirmSpy.mockRestore();
  });

  it("navigates to previous months and disables forward navigation at the current month", async () => {
    renderCalendar();
    const next = await screen.findByRole("button", { name: "Next month" });
    expect(next).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByText("May 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
    // Every May day is in the past — all enabled.
    expect(
      screen.getByRole("button", { name: "Log Escitalopram on May 31" }),
    ).toBeEnabled();
  });

  it("switches medications via the selector chips", async () => {
    const second: MedicationItem = { ...ITEM, id: 2, name: "Ibuprofen", defaultAmount: 200 };
    renderCalendar([ITEM, second]);

    fireEvent.click(await screen.findByRole("button", { name: "Ibuprofen" }));
    const day = await screen.findByRole("button", { name: "Log Ibuprofen on Jun 5" });
    fireEvent.click(day);

    await waitFor(() => {
      const post = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/intakes" &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      expect(JSON.parse((post![1] as { body: string }).body).itemId).toBe(2);
    });
  });
});
