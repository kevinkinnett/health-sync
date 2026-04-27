import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DossierEntry } from "@health-dashboard/shared";
import {
  DossierDrawer,
  type DossierDrawerTarget,
} from "../components/dossier/DossierDrawer";

// ---------------------------------------------------------------------------
// API stub
// ---------------------------------------------------------------------------

const apiFetch = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

beforeEach(() => {
  apiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides?: Partial<DossierEntry>): DossierEntry {
  return {
    itemType: "supplement",
    itemId: 123,
    itemName: "Vitamin D3",
    itemBrand: "Now Foods",
    itemForm: "capsule",
    model: "qwen3-max-2026-01-23",
    inputTokens: 1234,
    outputTokens: 567,
    fetchedAt: new Date().toISOString(),
    content: {
      version: 1,
      headline: "Vitamin D3 supports bone health.",
      disclaimer: "Reference info only — not medical advice.",
      sections: [
        {
          key: "summary",
          heading: "Summary",
          body: "Cholecalciferol is a fat-soluble vitamin [1].",
          sourceIds: [1],
        },
        {
          key: "dosing",
          heading: "Typical dosing",
          body: "Adults: 600–800 IU/day RDA [1]; up to 4000 IU UL [2].",
          sourceIds: [1, 2],
        },
      ],
      sources: [
        {
          id: 1,
          title: "NIH ODS Vitamin D",
          url: "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/",
          publisher: "NIH ODS",
        },
        {
          id: 2,
          title: "Drugs.com",
          url: "https://www.drugs.com/mtm/vitamin-d3.html",
          publisher: "Drugs.com",
        },
      ],
    },
    ...overrides,
  };
}

const SAMPLE_TARGET: DossierDrawerTarget = {
  type: "supplement",
  id: 123,
  itemName: "Vitamin D3",
  itemBrand: "Now Foods",
  itemForm: "capsule",
};

function Harness({ initial }: { initial: DossierDrawerTarget | null }) {
  const [target, setTarget] = useState(initial);
  return (
    <DossierDrawer target={target} onClose={() => setTarget(null)} />
  );
}

function renderDrawer(target: DossierDrawerTarget | null = SAMPLE_TARGET) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness initial={target} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DossierDrawer", () => {
  it("renders nothing when target is null", () => {
    const { container } = renderDrawer(null);
    expect(container.firstChild).toBeNull();
  });

  it("shows the empty-state CTA when no dossier is cached", async () => {
    apiFetch.mockResolvedValue(null); // GET returns null
    renderDrawer();
    expect(
      await screen.findByRole("button", { name: /build dossier/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no dossier yet/i)).toBeInTheDocument();
  });

  it("renders cached sections + sources when the dossier is present", async () => {
    apiFetch.mockResolvedValue(makeEntry());
    renderDrawer();

    expect(
      await screen.findByText(/Vitamin D3 supports bone health/i),
    ).toBeInTheDocument();

    // First section is open by default
    expect(
      screen.getByText(/Cholecalciferol is a fat-soluble vitamin/i),
    ).toBeInTheDocument();

    // Source list rendered
    expect(screen.getByText("NIH ODS Vitamin D")).toBeInTheDocument();
    expect(screen.getByText("Drugs.com")).toBeInTheDocument();
  });

  it("expands a collapsed section on click", async () => {
    apiFetch.mockResolvedValue(makeEntry());
    renderDrawer();

    // "Typical dosing" body is hidden initially (only first section open)
    await screen.findByText(/Vitamin D3 supports bone health/i);
    expect(screen.queryByText(/600–800 IU\/day RDA/)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /typical dosing/i }),
    );
    expect(
      await screen.findByText(/600–800 IU\/day RDA/),
    ).toBeInTheDocument();
  });

  it("renders [N] citations as anchor links targeting the source list", async () => {
    apiFetch.mockResolvedValue(makeEntry());
    renderDrawer();

    await screen.findByText(/Vitamin D3 supports bone health/i);

    // The body has [1] in the open Summary section. Confirm an anchor was
    // generated pointing to the source list anchor id.
    const cite = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "#dossier-source-1");
    expect(cite).toBeDefined();
  });

  it("calls POST /refresh when 'Build dossier' is clicked", async () => {
    // GET → null (empty), POST → fresh entry
    apiFetch.mockImplementation(
      (_path: string, init?: { method?: string }) => {
        if (init?.method === "POST") {
          return Promise.resolve(makeEntry());
        }
        return Promise.resolve(null);
      },
    );
    renderDrawer();

    fireEvent.click(
      await screen.findByRole("button", { name: /build dossier/i }),
    );

    await waitFor(() => {
      const postCall = apiFetch.mock.calls.find(
        ([p, init]) =>
          p === "/dossier/supplement/123/refresh" && init?.method === "POST",
      );
      expect(postCall).toBeDefined();
    });

    // After success the drawer flips to the populated view
    await screen.findByText(/Vitamin D3 supports bone health/i);
  });

  it("shows the refresh button on a cached dossier and refetches when clicked", async () => {
    let getCallCount = 0;
    apiFetch.mockImplementation(
      (_path: string, init?: { method?: string }) => {
        if (init?.method === "POST") {
          return Promise.resolve(
            makeEntry({
              content: {
                ...makeEntry().content,
                headline: "Updated headline after refresh.",
              },
            }),
          );
        }
        getCallCount++;
        return Promise.resolve(makeEntry());
      },
    );
    renderDrawer();

    await screen.findByText(/Vitamin D3 supports bone health/i);

    fireEvent.click(screen.getByRole("button", { name: /refresh dossier/i }));

    await screen.findByText(/Updated headline after refresh/i);
    expect(getCallCount).toBeGreaterThanOrEqual(1);
  });

  it("renders an error and a retry button when refresh fails", async () => {
    apiFetch.mockImplementation(
      (_path: string, init?: { method?: string }) => {
        if (init?.method === "POST") {
          return Promise.reject(new Error("API error 502: upstream broke"));
        }
        return Promise.resolve(null);
      },
    );
    renderDrawer();

    fireEvent.click(
      await screen.findByRole("button", { name: /build dossier/i }),
    );

    expect(
      await screen.findByText(/Couldn.t build dossier/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/upstream broke/i)).toBeInTheDocument();
  });

  it("Esc key closes the drawer", async () => {
    apiFetch.mockResolvedValue(makeEntry());
    renderDrawer();

    await screen.findByText(/Vitamin D3 supports bone health/i);

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.queryByText(/Vitamin D3 supports bone health/i),
      ).toBeNull();
    });
  });
});
