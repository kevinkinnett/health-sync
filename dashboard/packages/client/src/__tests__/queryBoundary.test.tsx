import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { QueryBoundary, EmptyState } from "../components/QueryBoundary";

/**
 * Why this exists: every single-query analytics screen used to read
 * `if (!q.data) return null;` and silently render a blank page on
 * API error. `<QueryBoundary>` lifts each state into deliberate UI;
 * these tests pin the four-state contract so a future refactor
 * can't silently regress to blank-on-error.
 */

function fakeQuery<T>(overrides: Partial<UseQueryResult<T>>): UseQueryResult<T> {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as unknown as UseQueryResult<T>;
}

describe("QueryBoundary", () => {
  it("renders a loading state with default skeleton while isLoading", () => {
    const query = fakeQuery<number[]>({ isLoading: true });
    render(
      <QueryBoundary query={query}>
        {(data) => <div>got {data.length}</div>}
      </QueryBoundary>,
    );
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("renders a custom skeleton when provided", () => {
    const query = fakeQuery<number[]>({ isLoading: true });
    render(
      <QueryBoundary
        query={query}
        skeleton={<div data-testid="custom-skel">custom</div>}
      >
        {(data) => <div>got {data.length}</div>}
      </QueryBoundary>,
    );
    expect(screen.getByTestId("custom-skel")).toBeInTheDocument();
  });

  it("renders an error card with a Retry button on isError, regardless of caller", () => {
    const refetch = vi.fn();
    const query = fakeQuery<number[]>({
      isError: true,
      error: new Error("boom"),
      refetch,
    });
    render(
      <QueryBoundary query={query}>
        {(data) => <div>got {data.length}</div>}
      </QueryBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/couldn't load/i);
    expect(alert).toHaveTextContent("boom");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("renders children(data) on success", () => {
    const query = fakeQuery<number[]>({ data: [1, 2, 3] });
    render(
      <QueryBoundary query={query}>
        {(data) => <div data-testid="content">got {data.length}</div>}
      </QueryBoundary>,
    );
    expect(screen.getByTestId("content")).toHaveTextContent("got 3");
  });

  it("renders the empty fallback when isEmpty returns true", () => {
    const query = fakeQuery<number[]>({ data: [] });
    render(
      <QueryBoundary
        query={query}
        isEmpty={(d) => d.length === 0}
        empty={<EmptyState message="No data yet" />}
      >
        {(data) => <div>got {data.length}</div>}
      </QueryBoundary>,
    );
    expect(screen.getByText(/no data yet/i)).toBeInTheDocument();
  });

  it("ignores the empty fallback when no isEmpty predicate is supplied", () => {
    // Even an empty array renders children — the caller opts in to
    // "empty" handling explicitly. Lets simple consumers keep using
    // an empty array safely without wiring up two more props.
    const query = fakeQuery<number[]>({ data: [] });
    render(
      <QueryBoundary
        query={query}
        empty={<div data-testid="empty">empty</div>}
      >
        {(data) => <div data-testid="content">got {data.length}</div>}
      </QueryBoundary>,
    );
    expect(screen.queryByTestId("empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("content")).toHaveTextContent("got 0");
  });
});
