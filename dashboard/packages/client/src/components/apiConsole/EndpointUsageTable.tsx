import type { ApiLogStats } from "@health-dashboard/shared";
import { ConsoleSection, QueryMessage } from "./ApiConsoleUi";

export function EndpointUsageTable({
  stats,
  isLoading,
  error,
}: {
  stats?: ApiLogStats;
  isLoading: boolean;
  error?: Error | null;
}) {
  return (
    <ConsoleSection
      icon="api"
      title="Endpoints (7d)"
      description="Top paths by call count over the last week."
    >
      {error ? (
        <QueryMessage error>Endpoint activity is unavailable: {error.message}</QueryMessage>
      ) : stats?.byPath.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/10 bg-surface-container-low">
                <TableHeading>Path</TableHeading>
                <TableHeading align="right">Calls</TableHeading>
                <TableHeading align="right">Avg duration</TableHeading>
              </tr>
            </thead>
            <tbody>
              {stats.byPath.map((row) => (
                <tr
                  key={row.path}
                  className="border-b border-outline-variant/5 transition-colors hover:bg-surface-container-high"
                >
                  <td className="px-6 py-2 font-mono text-xs text-on-surface">
                    {row.path}
                  </td>
                  <td className="px-6 py-2 text-right tabular-nums text-on-surface">
                    {row.count.toLocaleString()}
                  </td>
                  <td className="px-6 py-2 text-right tabular-nums text-on-surface-variant">
                    {row.avgDurationMs} ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <QueryMessage>
          {isLoading ? "Loading endpoints…" : "No requests in the last 7 days."}
        </QueryMessage>
      )}
    </ConsoleSection>
  );
}

function TableHeading({
  children,
  align = "left",
}: {
  children: string;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-6 py-3 text-xs font-semibold uppercase tracking-wider text-outline ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
