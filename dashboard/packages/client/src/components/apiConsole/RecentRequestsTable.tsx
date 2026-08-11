import type { ApiLogEntry } from "@health-dashboard/shared";
import { formatRelativeAgo } from "../../lib/relativeTime";
import { responseStatusTone } from "./apiConsoleModel";
import { QueryMessage } from "./ApiConsoleUi";

export function RecentRequestsTable({
  entries,
  isLoading,
  error,
  callerFilter,
  onCallerFilterChange,
  canLoadMore,
  onLoadMore,
}: {
  entries?: ApiLogEntry[];
  isLoading: boolean;
  error?: Error | null;
  callerFilter: string;
  onCallerFilterChange: (value: string) => void;
  canLoadMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container">
      <header className="flex flex-col gap-4 border-b border-outline-variant/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="flex items-center gap-2 font-headline text-lg font-semibold text-on-surface">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              list
            </span>
            Recent requests
          </h2>
          <p className="mt-1 text-xs text-outline">Live request history, newest first.</p>
        </div>
        <label className="text-xs font-semibold text-outline">
          <span className="sr-only">Filter recent requests by caller</span>
          <input
            type="search"
            value={callerFilter}
            onChange={(event) => onCallerFilterChange(event.target.value)}
            placeholder="Filter by caller…"
            aria-label="Filter recent requests by caller"
            className="w-full rounded-md border border-outline-variant/10 bg-surface-container-lowest px-3 py-2 text-sm font-normal text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/60 sm:w-64"
          />
        </label>
      </header>

      {error ? (
        <QueryMessage error>Recent requests are unavailable: {error.message}</QueryMessage>
      ) : entries?.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/10 bg-surface-container-low">
                  <TableHeading>When</TableHeading>
                  <TableHeading>Caller</TableHeading>
                  <TableHeading>Path</TableHeading>
                  <TableHeading align="right">Status</TableHeading>
                  <TableHeading align="right">Duration</TableHeading>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <RecentRequestRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
          {canLoadMore && (
            <div className="flex justify-center border-t border-outline-variant/10 p-4">
              <button
                type="button"
                onClick={onLoadMore}
                className="min-h-10 rounded-lg px-4 text-sm font-bold uppercase tracking-wider text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Load more
              </button>
            </div>
          )}
        </>
      ) : (
        <QueryMessage>{isLoading ? "Loading requests…" : "No recent requests."}</QueryMessage>
      )}
    </section>
  );
}

function RecentRequestRow({ entry }: { entry: ApiLogEntry }) {
  const tone = responseStatusTone(entry.statusCode);
  const toneColor =
    tone === "bad" ? "text-error" : tone === "warn" ? "text-tertiary" : "text-secondary";

  return (
    <tr className="border-b border-outline-variant/5 transition-colors hover:bg-surface-container-high">
      <td
        className="whitespace-nowrap px-6 py-2 tabular-nums text-on-surface-variant"
        title={entry.createdAt}
      >
        {formatRelativeAgo(entry.createdAt)}
      </td>
      <td className="px-6 py-2 font-mono text-xs text-on-surface">
        {entry.caller ?? <span className="italic text-outline">anonymous</span>}
      </td>
      <td className="px-6 py-2 font-mono text-xs text-on-surface">
        {entry.method} {entry.path}
      </td>
      <td className="px-6 py-2 text-right tabular-nums">
        <span className={`text-xs font-bold ${toneColor}`}>{entry.statusCode}</span>
      </td>
      <td className="px-6 py-2 text-right tabular-nums text-on-surface-variant">
        {entry.durationMs} ms
      </td>
    </tr>
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
