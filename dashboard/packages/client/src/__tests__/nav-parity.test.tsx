import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "../components/Layout";

// Stub all API calls — Layout's useTzReconciliation calls /api/config
// and the page outlet may try to fetch summaries, but for a nav test we
// only need the chrome to render.
vi.mock("../api/client", () => ({
  apiFetch: vi.fn(() => Promise.resolve({})),
}));

function renderLayout() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function navHrefs(nav: HTMLElement): string[] {
  return Array.from(nav.querySelectorAll<HTMLAnchorElement>("a")).map(
    (a) => a.getAttribute("href") ?? "",
  );
}

function navLabels(nav: HTMLElement): string[] {
  return Array.from(nav.querySelectorAll<HTMLAnchorElement>("a")).map(
    (a) => a.textContent?.trim() ?? "",
  );
}

/**
 * Why this test exists: the dashboard previously kept a hand-maintained
 * `mobileItems` list separate from the desktop sidebar's `navSections`.
 * Every time a new analytics screen got added the desktop rail picked
 * it up but the mobile menu silently fell behind, so newer features
 * were unreachable on phones until someone noticed and patched the
 * second list.
 *
 * The fix was to render both navs from the same `navSections` constant.
 * This test guards that property at runtime: open the mobile drawer and
 * assert it exposes exactly the same routes (and labels) as the desktop
 * rail. If the two ever diverge — accidentally or intentionally — this
 * test fails and forces the change to be visible in code review.
 */
describe("Nav parity (desktop sidebar ↔ mobile drawer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("desktop sidebar and mobile drawer expose identical routes", () => {
    renderLayout();

    const sidebar = screen.getByTestId("primary-nav");
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const drawer = screen.getByTestId("mobile-menu-nav");

    // Order matters too — the mobile drawer should mirror the sidebar's
    // section order so users get a consistent mental model across
    // viewports.
    expect(navHrefs(drawer)).toEqual(navHrefs(sidebar));
  });

  it("desktop sidebar and mobile drawer use identical labels", () => {
    renderLayout();

    const sidebar = screen.getByTestId("primary-nav");
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const drawer = screen.getByTestId("mobile-menu-nav");

    // Catches the case where someone adds a new nav item and accidentally
    // gives it different copy in only one of the two navs (which would
    // pass the href-only check above).
    expect(navLabels(drawer)).toEqual(navLabels(sidebar));
  });

  it("the mobile drawer is closed by default", () => {
    renderLayout();
    expect(screen.queryByTestId("mobile-menu-nav")).not.toBeInTheDocument();
  });

  it("clicking the More button opens the drawer; close button dismisses it", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(screen.getByTestId("mobile-menu-nav")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));
    expect(screen.queryByTestId("mobile-menu-nav")).not.toBeInTheDocument();
  });
});
