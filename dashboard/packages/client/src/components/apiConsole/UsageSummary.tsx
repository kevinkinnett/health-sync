import type { ApiLogStats } from "@health-dashboard/shared";
import { errorRateTone, type StatusTone } from "./apiConsoleModel";
import { ConsoleSection, QueryMessage } from "./ApiConsoleUi";

export function UsageSummary({
  stats,
  isLoading,
  error,
}: {
  stats?: ApiLogStats;
  isLoading: boolean;
  error?: Error | null;
}) {
  return (
    <ConsoleSection icon="monitoring" title="Usage (last 24 hours)">
      {error ? (
        <QueryMessage error>Usage data is unavailable: {error.message}</QueryMessage>
      ) : isLoading ? (
        <QueryMessage>Loading usage…</QueryMessage>
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4 sm:p-6">
          <StatTile label="24h calls" value={stats.totalCalls.toLocaleString()} />
          <StatTile
            label="Unique callers"
            value={stats.uniqueCallers.toLocaleString()}
            sub={
              stats.byCaller[0]
                ? `top: ${stats.byCaller[0].caller ?? "anonymous"} (${stats.byCaller[0].count.toLocaleString()})`
                : undefined
            }
          />
          <StatTile
            label="Avg response"
            value={stats.avgDurationMs != null ? `${stats.avgDurationMs} ms` : "—"}
            sub={stats.p95DurationMs != null ? `p95 ${stats.p95DurationMs} ms` : undefined}
          />
          <StatTile
            label="Error rate"
            value={`${(stats.errorRate * 100).toFixed(1)}%`}
            sub={`${stats.errorCount} 5xx`}
            tone={errorRateTone(stats.errorRate)}
          />
        </div>
      ) : (
        <QueryMessage>No data yet — try one of the curl examples above.</QueryMessage>
      )}
    </ConsoleSection>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatusTone;
}) {
  const toneColor =
    tone === "good"
      ? "text-secondary"
      : tone === "warn"
        ? "text-tertiary"
        : tone === "bad"
          ? "text-error"
          : "text-on-surface";

  return (
    <div className="rounded-lg border border-outline-variant/5 bg-surface-container-low p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-outline">
        {label}
      </div>
      <div className={`font-headline text-2xl font-bold tabular-nums ${toneColor}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] tabular-nums text-outline">{sub}</div>}
    </div>
  );
}
