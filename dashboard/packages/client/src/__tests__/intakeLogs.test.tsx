import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MedicationLog } from "../components/medications/MedicationLog";
import { SupplementLog } from "../components/supplements/SupplementLog";

const apiFetch = vi.fn();

vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

function renderLog(component: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>,
  );
}

const medication = {
  id: 1,
  name: "Lisinopril",
  brand: "Prinivil",
  form: "tablet",
  defaultAmount: 10,
  defaultUnit: "mg",
  notes: null,
  isActive: true,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

beforeEach(() => {
  apiFetch.mockReset();
  vi.restoreAllMocks();
});

describe("shared intake logging workflow", () => {
  it("validates an item without a default amount before logging", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/medications/items") {
        return Promise.resolve([{ ...medication, defaultAmount: null }]);
      }
      return Promise.resolve([]);
    });
    renderLog(<MedicationLog />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Quick log Lisinopril" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      screen.getByText(/amount is required because this item has no default/i),
    ).toBeVisible();
    expect(
      apiFetch.mock.calls.some(
        ([path, init]) =>
          path === "/medications/intakes" && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("submits an explicit custom timestamp", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/medications/items") return Promise.resolve([medication]);
      if (path === "/medications/intakes" && init?.method === "POST") {
        return Promise.resolve({
          id: 9,
          itemId: 1,
          itemName: medication.name,
          takenAt: new Date().toISOString(),
          amount: 10,
          unit: "mg",
          notes: null,
          createdAt: new Date().toISOString(),
        });
      }
      return Promise.resolve([]);
    });
    renderLog(<MedicationLog />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Quick log Lisinopril" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /adjust time/i }));
    const beforePreset = Date.now();
    fireEvent.click(screen.getByRole("button", { name: "1h ago" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/intakes" && init?.method === "POST",
      );
      const body = JSON.parse(call?.[1]?.body as string);
      expect(body.takenAt).toBeTypeOf("string");
      expect(new Date(body.takenAt).getTime()).toBeGreaterThanOrEqual(
        beforePreset - 60 * 60 * 1000 - 1_000,
      );
      expect(new Date(body.takenAt).getTime()).toBeLessThanOrEqual(
        Date.now() - 60 * 60 * 1000 + 1_000,
      );
    });
  });

  it("changes the intake query when the history range changes", async () => {
    apiFetch.mockResolvedValue([]);
    renderLog(<MedicationLog />);

    await screen.findByText(/no history in this range/i);
    fireEvent.click(screen.getByRole("button", { name: "7D" }));

    await waitFor(() => {
      const rangeCalls = apiFetch.mock.calls
        .map(([path]) => String(path))
        .filter(
          (path) =>
            path.startsWith("/medications/intakes?start=") &&
            !path.includes("&end="),
        );
      const latest = new URL(`http://local${rangeCalls.at(-1)}`);
      const start = new Date(latest.searchParams.get("start")!);
      const expected = new Date();
      expected.setDate(expected.getDate() - 7);
      expect(start.getFullYear()).toBe(expected.getFullYear());
      expect(start.getMonth()).toBe(expected.getMonth());
      expect(start.getDate()).toBe(expected.getDate());
    });
  });

  it("retries item loading without taking down intake history", async () => {
    let itemAttempts = 0;
    apiFetch.mockImplementation((path: string) => {
      if (path === "/medications/items") {
        itemAttempts += 1;
        return itemAttempts === 1
          ? Promise.reject(new Error("Medication library unavailable"))
          : Promise.resolve([medication]);
      }
      return Promise.resolve([]);
    });
    renderLog(<MedicationLog />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Medication library unavailable");
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading medications" }),
    );

    expect(
      await screen.findByRole("button", { name: "Quick log Lisinopril" }),
    ).toBeVisible();
    expect(itemAttempts).toBe(2);
  });

  it("keeps a failed log open and makes the retry explicit", async () => {
    let postAttempts = 0;
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/medications/items") return Promise.resolve([medication]);
      if (path === "/medications/intakes" && init?.method === "POST") {
        postAttempts += 1;
        return postAttempts === 1
          ? Promise.reject(new Error("Database unavailable"))
          : Promise.resolve({
              id: 9,
              itemId: 1,
              itemName: medication.name,
              takenAt: new Date().toISOString(),
              amount: 10,
              unit: "mg",
              notes: null,
              createdAt: new Date().toISOString(),
            });
      }
      return Promise.resolve([]);
    });
    renderLog(<MedicationLog />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Quick log Lisinopril" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not log this dose: Database unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(postAttempts).toBe(2));
  });

  it("locks the confirmation controls while a log is pending", async () => {
    let resolvePost: ((value: unknown) => void) | undefined;
    const pendingPost = new Promise((resolve) => {
      resolvePost = resolve;
    });
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/medications/items") return Promise.resolve([medication]);
      if (path === "/medications/intakes" && init?.method === "POST") {
        return pendingPost;
      }
      return Promise.resolve([]);
    });
    renderLog(<MedicationLog />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Quick log Lisinopril" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByRole("button", { name: "Logging…" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Amount")).toBeDisabled();
    expect(screen.getByLabelText("Unit")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    resolvePost?.({
      id: 9,
      itemId: 1,
      itemName: medication.name,
      takenAt: new Date().toISOString(),
      amount: 10,
      unit: "mg",
      notes: null,
      createdAt: new Date().toISOString(),
    });
    await waitFor(() =>
      expect(screen.queryByText("Logging Lisinopril")).not.toBeInTheDocument(),
    );
  });

  it("uses inline deletion confirmation and preserves a retryable failure", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    let deleteAttempts = 0;
    let deleted = false;
    const intake = {
      id: 55,
      itemId: 1,
      itemName: medication.name,
      takenAt: new Date().toISOString(),
      amount: 10,
      unit: "mg",
      notes: "with breakfast",
      createdAt: new Date().toISOString(),
    };
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/medications/items") return Promise.resolve([]);
      if (path === "/medications/intakes/55" && init?.method === "DELETE") {
        deleteAttempts += 1;
        if (deleteAttempts === 1) {
          return Promise.reject(new Error("Delete failed"));
        }
        deleted = true;
        return Promise.resolve(undefined);
      }
      if (path.startsWith("/medications/intakes")) {
        return Promise.resolve(deleted ? [] : [intake]);
      }
      return Promise.resolve([]);
    });
    renderLog(<MedicationLog />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: /delete lisinopril intake at/i,
      }),
    );
    expect(screen.getByText(/this cannot be undone/i)).toBeVisible();
    expect(confirmSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not delete this intake: Delete failed",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(deleteAttempts).toBe(2));
  });

  it("explains when supplement composition cannot follow a changed unit", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/supplements/items") {
        return Promise.resolve([
          {
            ...medication,
            id: 7,
            name: "Calm blend",
            defaultAmount: 1,
            defaultUnit: "capsule",
            ingredients: [
              {
                ingredientId: 11,
                ingredientName: "Ashwagandha",
                amount: 300,
                unit: "mg",
                sortOrder: 0,
              },
            ],
          },
        ]);
      }
      return Promise.resolve([]);
    });
    renderLog(<SupplementLog />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Quick log Calm blend" }),
    );
    fireEvent.change(screen.getByLabelText("Unit"), {
      target: { value: "tablet" },
    });

    expect(
      screen.getByText(/breakdown will be skipped because the unit does not match/i),
    ).toBeVisible();
  });
});
