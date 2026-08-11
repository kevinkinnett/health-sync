import { EndpointUsageTable } from "../components/apiConsole/EndpointUsageTable";
import { apiBaseUrl } from "../components/apiConsole/apiConsoleModel";
import { QuickStartCard } from "../components/apiConsole/QuickStartCard";
import { RecentRequestsTable } from "../components/apiConsole/RecentRequestsTable";
import { UsageSummary } from "../components/apiConsole/UsageSummary";
import { useApiConsole } from "../components/apiConsole/useApiConsole";
import { PageHeader } from "../components/ui/PageHeader";

/** Composition boundary for API documentation and request observability. */
export function ApiConsole() {
  const base = apiBaseUrl();
  const state = useApiConsole();

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Console"
        description="Read-only REST API for scripts, scheduled jobs, and MCP servers on the Tailnet. Explore live documentation and request health below."
        action={
          <a
            href="/api/v1/docs"
            target="_blank"
            rel="noreferrer"
            className="min-h-10 rounded-lg px-3 py-2 font-mono text-sm text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title={`${base}/docs`}
          >
            Swagger UI →
          </a>
        }
      />

      <QuickStartCard base={base} />
      <UsageSummary
        stats={state.stats24h.data}
        isLoading={state.stats24h.isLoading}
        error={state.stats24h.error}
      />
      <EndpointUsageTable
        stats={state.stats7d.data}
        isLoading={state.stats7d.isLoading}
        error={state.stats7d.error}
      />
      <RecentRequestsTable
        entries={state.recent.data}
        isLoading={state.recent.isLoading}
        error={state.recent.error}
        callerFilter={state.callerFilter}
        onCallerFilterChange={state.changeCallerFilter}
        canLoadMore={state.canLoadMore}
        onLoadMore={state.loadMore}
      />
    </div>
  );
}
