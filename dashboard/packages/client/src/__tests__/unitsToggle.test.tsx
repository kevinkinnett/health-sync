import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Settings } from "../pages/Settings";
import { useUnitsStore, useUnits } from "../stores/unitsStore";
import { formatWeight, formatDistance } from "../lib/units";

vi.mock("../api/client", () => ({
  apiFetch: vi.fn(() => Promise.resolve({})),
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Minimal consumer that mirrors how real components read the store.
 * Lets us test the store→display wiring end-to-end without mocking
 * every API call the real Dashboard fires.
 */
function UnitsConsumer() {
  const units = useUnits();
  return (
    <div>
      <span data-testid="weight">{formatWeight(84.5, units)}</span>
      <span data-testid="distance">{formatDistance(6.39, units)}</span>
    </div>
  );
}

describe("Units preference toggle", () => {
  beforeEach(() => {
    // Pin the store to a known starting state so prior runs don't leak.
    useUnitsStore.setState({ units: "metric" });
    vi.clearAllMocks();
  });

  it("Settings exposes a Metric/Imperial radio group", () => {
    renderWithProviders(<Settings />);
    const group = screen.getByRole("radiogroup", { name: /measurement units/i });
    expect(within(group).getByRole("radio", { name: /imperial/i })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: /metric/i })).toBeInTheDocument();
  });

  it("clicking a unit option updates the store", () => {
    renderWithProviders(<Settings />);
    expect(useUnitsStore.getState().units).toBe("metric");

    fireEvent.click(screen.getByRole("radio", { name: /imperial/i }));
    expect(useUnitsStore.getState().units).toBe("imperial");

    fireEvent.click(screen.getByRole("radio", { name: /metric/i }));
    expect(useUnitsStore.getState().units).toBe("metric");
  });

  it("a consumer reads metric units by default", () => {
    renderWithProviders(<UnitsConsumer />);
    expect(screen.getByTestId("weight")).toHaveTextContent("84.5 kg");
    expect(screen.getByTestId("distance")).toHaveTextContent("6.4 km");
  });

  it("a consumer re-renders with imperial after toggling the store", () => {
    renderWithProviders(<UnitsConsumer />);
    // act() so React commits the store update before the assertion.
    act(() => {
      useUnitsStore.setState({ units: "imperial" });
    });
    expect(screen.getByTestId("weight")).toHaveTextContent("186.3 lb");
    expect(screen.getByTestId("distance")).toHaveTextContent("4.0 mi");
  });

  it("Settings toggle propagates to a consumer rendered alongside it", () => {
    // Render BOTH the Settings UI and a consumer in the same tree.
    // Clicking the toggle must immediately update the consumer's
    // displayed values — proving the wiring (store ↔ both consumers)
    // works the way the real app uses it.
    renderWithProviders(
      <>
        <Settings />
        <UnitsConsumer />
      </>,
    );
    expect(screen.getByTestId("weight")).toHaveTextContent("84.5 kg");

    fireEvent.click(screen.getByRole("radio", { name: /imperial/i }));
    expect(screen.getByTestId("weight")).toHaveTextContent("186.3 lb");
    expect(screen.getByTestId("distance")).toHaveTextContent("4.0 mi");
  });
});
