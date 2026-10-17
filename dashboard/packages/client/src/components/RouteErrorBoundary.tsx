import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/Button";

/**
 * Catches a render error inside one screen so the rest of the app — top
 * bar, side nav, bottom nav — keeps working.
 *
 * Without this, any throw during render (a response-shape drift, a null
 * field, a failed lazy chunk) unmounts the whole React root and leaves a
 * blank dark page with no way out but a manual reload. QueryBoundary does
 * not help there: it handles query *states*, not exceptions.
 *
 * Keyed on the pathname by {@link RouteErrorBoundary}, so navigating to
 * another screen always starts with a clean boundary.
 */
interface BoundaryProps {
  children: ReactNode;
  onRetry: () => void;
}

interface BoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Screen failed to render", error, info.componentStack);
  }

  private retry = () => {
    this.props.onRetry();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <ScreenError error={this.state.error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

export function ScreenError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-error/30 bg-error/10 p-8 text-center">
      <h2 className="font-headline text-2xl font-semibold text-on-surface">
        This screen couldn’t be displayed
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-on-surface-variant">
        Something on this page failed to render. The rest of the app still works — use the
        navigation to go elsewhere, or try again. Your stored data has not been changed.
      </p>
      <p className="mx-auto mt-3 max-w-xl break-all font-mono text-xs text-on-surface-variant">
        {error.message}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button variant="danger" onClick={onRetry}>Try again</Button>
        <Button variant="quiet" onClick={() => window.location.reload()}>Reload app</Button>
      </div>
    </div>
  );
}

/**
 * Per-route boundary. Retry refetches the screen's data first — the
 * usual cause is a payload the component didn't expect, so re-rendering
 * against the same cached response would just throw again.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  return (
    <ErrorBoundary
      key={pathname}
      onRetry={() => {
        void queryClient.resetQueries({ type: "active" });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
