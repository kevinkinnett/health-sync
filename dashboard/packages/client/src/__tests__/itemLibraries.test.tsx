import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MedicationLibrary } from "../components/medications/MedicationLibrary";
import { SupplementLibrary } from "../components/supplements/SupplementLibrary";

const apiFetch = vi.fn();

vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock("../components/dossier/DossierDrawer", () => ({
  DossierDrawer: ({ target }: { target: { itemName: string } | null }) =>
    target ? <div role="dialog">Dossier for {target.itemName}</div> : null,
}));

function renderLibrary(component: React.ReactNode) {
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

const archivedMedication = {
  ...medication,
  id: 2,
  name: "Archived medicine",
  isActive: false,
};

beforeEach(() => {
  apiFetch.mockReset();
});

describe("item libraries", () => {
  it("creates a medication from the shared validated item form", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/medications/items" && init?.method === "POST") {
        return Promise.resolve({ ...medication, name: "Metformin" });
      }
      return Promise.resolve([]);
    });
    renderLibrary(<MedicationLibrary />);

    fireEvent.click(await screen.findByRole("button", { name: /add medication/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), {
      target: { value: "Metformin" },
    });
    fireEvent.change(screen.getByLabelText(/default amount/i), {
      target: { value: "500" },
    });
    fireEvent.change(screen.getByLabelText(/default unit/i), {
      target: { value: "mg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/items" && init?.method === "POST",
      );
      expect(JSON.parse(call?.[1]?.body as string)).toMatchObject({
        name: "Metformin",
        defaultAmount: 500,
        defaultUnit: "mg",
      });
    });
  });

  it("edits a medication through an explicit card action", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/medications/items?includeInactive=true") {
        return Promise.resolve([medication]);
      }
      if (path === "/medications/items/1" && init?.method === "PATCH") {
        return Promise.resolve({ ...medication, brand: "Generic" });
      }
      return Promise.resolve([]);
    });
    renderLibrary(<MedicationLibrary />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Lisinopril" }),
    );
    const brand = screen.getByLabelText(/^brand/i);
    fireEvent.change(brand, { target: { value: "Generic" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const call = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/items/1" && init?.method === "PATCH",
      );
      expect(JSON.parse(call?.[1]?.body as string)).toMatchObject({
        brand: "Generic",
      });
    });
  });

  it("archives and restores items with explicit confirmation", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/medications/items?includeInactive=true") {
        return Promise.resolve([medication, archivedMedication]);
      }
      if (path === "/medications/items/1" && init?.method === "DELETE") {
        return Promise.resolve(undefined);
      }
      if (path === "/medications/items/2" && init?.method === "PATCH") {
        return Promise.resolve({ ...archivedMedication, isActive: true });
      }
      return Promise.resolve([]);
    });
    renderLibrary(<MedicationLibrary />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Lisinopril" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    fireEvent.click(screen.getByRole("button", { name: /confirm archive/i }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/medications/items/1", {
        method: "DELETE",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /archived \(1\)/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "Restore Archived medicine" }),
    );
    await waitFor(() => {
      const call = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/medications/items/2" && init?.method === "PATCH",
      );
      expect(JSON.parse(call?.[1]?.body as string)).toEqual({ isActive: true });
    });
  });

  it("opens the dossier from its own accessible card action", async () => {
    apiFetch.mockResolvedValue([medication]);
    renderLibrary(<MedicationLibrary />);

    fireEvent.click(
      await screen.findByRole("button", { name: "View Lisinopril dossier" }),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Dossier for Lisinopril");
  });

  it("surfaces query failures with a retry action", async () => {
    apiFetch.mockRejectedValueOnce(new Error("Library unavailable"));
    renderLibrary(<MedicationLibrary />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Library unavailable",
    );
    expect(screen.getByRole("button", { name: /try again/i })).toBeVisible();
  });

  it("keeps the editor open and surfaces mutation failures", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/medications/items" && init?.method === "POST") {
        return Promise.reject(new Error("Could not save medication"));
      }
      return Promise.resolve([]);
    });
    renderLibrary(<MedicationLibrary />);

    fireEvent.click(await screen.findByRole("button", { name: /add medication/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), {
      target: { value: "Metformin" },
    });
    fireEvent.change(screen.getByLabelText(/default unit/i), {
      target: { value: "mg" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save medication",
    );
    expect(screen.getByLabelText(/^name/i)).toHaveValue("Metformin");
  });

  it("persists supplement composition after creating the parent item", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/supplements/items?includeInactive=true") {
        return Promise.resolve([]);
      }
      if (path === "/supplements/ingredients" && !init) {
        return Promise.resolve([
          {
            id: 11,
            name: "Ashwagandha",
            notes: null,
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
          },
        ]);
      }
      if (path === "/supplements/items" && init?.method === "POST") {
        return Promise.resolve({
          ...medication,
          id: 7,
          name: "Calm blend",
          ingredients: [],
        });
      }
      if (
        path === "/supplements/items/7/ingredients" &&
        init?.method === "PUT"
      ) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    renderLibrary(<SupplementLibrary />);

    fireEvent.click(await screen.findByRole("button", { name: /add supplement/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), {
      target: { value: "Calm blend" },
    });
    fireEvent.change(screen.getByLabelText(/default amount/i), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText(/default unit/i), {
      target: { value: "capsule" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add ingredient/i }));
    fireEvent.change(screen.getByLabelText("Ingredient 1 name"), {
      target: { value: "Ashwagandha" },
    });
    fireEvent.change(screen.getByLabelText("Ingredient 1 amount"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const compositionCall = apiFetch.mock.calls.find(
        ([path, init]) =>
          path === "/supplements/items/7/ingredients" &&
          init?.method === "PUT",
      );
      expect(JSON.parse(compositionCall?.[1]?.body as string)).toEqual({
        ingredients: [
          { ingredientId: 11, amount: 300, unit: "mg", sortOrder: 0 },
        ],
      });
    });
  });
});
