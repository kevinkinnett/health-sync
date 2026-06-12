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

const JUN10_INTAKE = {
  id: 55,
  itemId: 1,
  itemName: "Escitalopram",
  takenAt: new Date(2026, 5, 10, 8).toISOString(),
  amount: 10,
  unit: "mg",
  notes: null,
  createdAt: new Date(2026, 5, 10, 8).toISOString(),
};

function mockWithJun10Intakes(intakes: object[] = [JUN10_INTAKE]) {
  apiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path.startsWith("/medications/intakes")) {
      if (init?.method === "POST" || init?.method === "PATCH") return Promise.resolve({});
      if (init?.method === "DELETE") return Promise.resolve(undefined);
      return Promise.resolve(intakes);
    }
    return Promise.resolve([]);
  });
}

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
  it("renders the current month with future days disabled, today enabled, and the medication chip visible", async () => {
    renderCalendar();
    expect(await screen.findByText("June 2026")).toBeInTheDocument();
    // Jun 20 is in the future relative to the frozen Jun 15 clock.
    const future = screen.getByRole("button", { name: "Log Escitalopram on Jun 20" });
    expect(future).toBeDisabled();
    const today = screen.getByRole("button", { name: "Log Escitalopram on Jun 15" });
    expect(today).toBeEnabled();
    // The selector chip shows even with a single medication.
    const chip = screen.getByRole("button", { name: "Escitalopram" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the dose amount on logged day cells (summed for multi-dose days)", async () => {
    mockWithJun10Intakes([
      JUN10_INTAKE,
      { ...JUN10_INTAKE, id: 56, takenAt: new Date(2026, 5, 10, 20).toISOString() },
      { ...JUN10_INTAKE, id: 57, takenAt: new Date(2026, 5, 8, 8).toISOString() },
    ]);
    renderCalendar();

    const single = await screen.findByRole("button", {
      name: "View 1 intake of Escitalopram on Jun 8",
    });
    expect(single).toHaveTextContent("10mg");

    const double = screen.getByRole("button", {
      name: "View 2 intakes of Escitalopram on Jun 10",
    });
    expect(double).toHaveTextContent("20mg");
    expect(double).toHaveTextContent("×2");
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

  it("opens a modal dialog for a logged day, showing dose and time", async () => {
    mockWithJun10Intakes();
    renderCalendar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "View 1 intake of Escitalopram on Jun 10",
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: /doses on jun 10/i });
    expect(dialog).toHaveTextContent(/change the amount and save, delete a dose/i);
    const amountInput = screen.getByLabelText(/amount for intake/i) as HTMLInputElement;
    expect(amountInput.value).toBe("10");
    const unitInput = screen.getByLabelText(/unit for intake/i) as HTMLInputElement;
    expect(unitInput.value).toBe("mg");
  });

  it("edits a dose via PATCH from the day dialog", async () => {
    mockWithJun10Intakes();
    renderCalendar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "View 1 intake of Escitalopram on Jun 10",
      }),
    );
    const amountInput = await screen.findByLabelText(/amount for intake/i);
    fireEvent.change(amountInput, { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const patch = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/intakes/55" &&
          (init as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patch).toBeDefined();
      expect(JSON.parse((patch![1] as { body: string }).body)).toEqual({
        amount: 20,
        unit: "mg",
      });
    });
  });

  it("deletes a dose directly from the dialog (the dialog is the confirmation step)", async () => {
    mockWithJun10Intakes();
    renderCalendar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "View 1 intake of Escitalopram on Jun 10",
      }),
    );
    fireEvent.click(await screen.findByLabelText(/delete intake at/i));

    await waitFor(() => {
      const delCall = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/intakes/55" &&
          (init as RequestInit | undefined)?.method === "DELETE",
      );
      expect(delCall).toBeDefined();
    });
  });

  it("closes the dialog via the Done button without mutating anything", async () => {
    mockWithJun10Intakes();
    renderCalendar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "View 1 intake of Escitalopram on Jun 10",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(
      apiFetch.mock.calls.find(([, init]) => {
        const m = (init as RequestInit | undefined)?.method;
        return m === "DELETE" || m === "PATCH" || m === "POST";
      }),
    ).toBeUndefined();
  });

  it("adds another dose for the day from the dialog", async () => {
    mockWithJun10Intakes();
    renderCalendar();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "View 1 intake of Escitalopram on Jun 10",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: /add dose/i }));

    await waitFor(() => {
      const post = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/intakes" &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as { body: string }).body);
      expect(body.itemId).toBe(1);
      expect(body.takenAt).toBe(new Date(2026, 5, 10, 8).toISOString());
    });
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
