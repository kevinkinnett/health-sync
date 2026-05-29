import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

/**
 * Render-prop wrapper that consistently handles the four states of a
 * React Query result: loading, error, empty, and success.
 *
 * Audit-driven motivation (#5): every single-query screen used to
 * read `if (!q.data) return null;` and silently render a blank page
 * on API failure, hiding the error from the user. Wrapping with
 * `<QueryBoundary>` lifts each state into a deliberate UI:
 *
 *   - `isLoading` → `skeleton` prop (defaults to a small spinner).
 *   - `isError`   → an error card with a Retry button that calls
 *                   `refetch()`. Always rendered — non-overridable
 *                   because hiding errors is what we're fixing.
 *   - empty data  → the `empty` prop, if provided. Optional because
 *                   not every consumer wants to distinguish "no rows"
 *                   from "first render"; pass `isEmpty` to opt in.
 *   - success     → `children(data)` with the data narrowed to non-
 *                   nullable.
 *
 * Generic in `T` so the children render-prop sees the query's data
 * type without `!` or null checks.
 */
export interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  /** Custom loading skeleton. Defaults to a centred spinner card. */
  skeleton?: ReactNode;
  /**
   * Optional "empty" fallback. When `isEmpty(data)` returns true the
   * boundary renders this instead of `children(data)`. Skipped when
   * `isEmpty` isn't provided — the children render unconditionally on
   * success.
   */
  empty?: ReactNode;
  /** Predicate that decides whether `data` should be shown as empty. */
  isEmpty?: (data: T) => boolean;
}

export function QueryBoundary<T>({
  query,
  children,
  skeleton,
  empty,
  isEmpty,
}: QueryBoundaryProps<T>) {
  if (query.isLoading) {
    return <>{skeleton ?? <LoadingState />}</>;
  }
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }
  if (query.data === undefined) {
    // Edge case: not loading, not errored, no data. Defensive — should
    // not normally occur with React Query semantics, but treating it
    // as loading is friendlier than crashing the render-prop.
    return <>{skeleton ?? <LoadingState />}</>;
  }
  if (empty != null && isEmpty?.(query.data)) {
    return <>{empty}</>;
  }
  return <>{children(query.data)}</>;
}

// ---------------------------------------------------------------------------
// Default state UIs — opinionated but overridable via props
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex items-center justify-center py-24"
    >
      <div className="text-outline text-sm font-medium animate-pulse">
        Loading…
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";
  return (
    <div
      role="alert"
      className="bg-error/10 border border-error/30 rounded-xl p-6 flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-error">error</span>
        <h3 className="text-sm font-bold text-on-surface">
          Couldn't load this section
        </h3>
      </div>
      <p className="text-xs text-on-surface-variant font-mono break-all">
        {message}
      </p>
      <div>
        <button
          onClick={onRetry}
          className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg bg-error text-on-error hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

/**
 * Convenience empty-state card. Pass to `<QueryBoundary empty>`.
 */
export function EmptyState({
  message,
  icon = "inbox",
}: {
  message: string;
  icon?: string;
}) {
  return (
    <div className="bg-surface-container rounded-xl p-12 text-center border border-outline-variant/10">
      <span className="material-symbols-outlined text-5xl text-outline mb-3 block">
        {icon}
      </span>
      <p className="text-on-surface-variant text-sm">{message}</p>
    </div>
  );
}
