import { useState } from "react";
import { useApiLogStats, useRecentApiCalls } from "../api/queries";

/**
 * The base URL the dashboard advertises in the Quick Start panel.
 *
 * In production the API is served by the same Express process the
 * dashboard runs in (see `index.ts`), so the v1 surface is always at
 * `${origin}/api/v1`. Showing the live origin (rather than a static
 * Tailscale hostname) makes the curl examples Just Work whether the
 * user opened the dashboard via Tailscale, localhost, or anything else.
 */
function apiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/v1`;
}

interface QuickStartExample {
  title: string;
  description: string;
  cmd: string;
}

function buildExamples(base: string): QuickStartExample[] {
  return [
    {
      title: "Latest health snapshot",
      description: "One call returns latest values + 30-day sparklines for every metric.",
      cmd: `curl ${base}/summary`,
    },
    {
      title: "Activity over the last month",
      description: "Per-day steps, distance, calories, active minutes.",
      cmd: `curl "${base}/activity?start=2026-04-03&end=2026-05-03"`,
    },
    {
      title: "Personal records and current streaks",
      description: "All-time bests + active streaks (today's in-progress day is skipped).",
      cmd: `curl ${base}/records`,
    },
    {
      title: "Identify your script (recommended)",
      description: "Pass an X-Caller header so your calls show up tagged in the stats below.",
      cmd: `curl -H "X-Caller: my-script" ${base}/summary`,
    },
    {
      title: "Supplement → health correlations",
      description: "Pearson r between an item's intake signal and each metric, with optional day lag.",
      cmd: `curl "${base}/supplements/correlations?itemId=7&lag=1"`,
    },
  ];
}

function CopyableCommand({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg p-3 pr-12 text-xs font-mono text-on-surface-variant overflow-x-auto">
        {value}
      </pre>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy command"
        className="absolute right-2 top-2 p-1.5 rounded text-outline hover:text-primary hover:bg-surface-container transition-colors"
      >
        <span className="material-symbols-outlined text-base">
          {copied ? "check" : "content_copy"}
        </span>
      </button>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
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
    <div className="bg-surface-container-low rounded-lg p-4 border border-outline-variant/5">
      <div className="text-[10px] uppercase tracking-widest font-bold text-outline">
        {label}
      </div>
      <div className={`text-2xl font-headline font-bold tabular-nums ${toneColor}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-outline tabular-nums mt-1">{sub}</div>
      )}
    </div>
  );
}

function relativeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ApiConsole() {
  const base = apiBaseUrl();
  const examples = buildExamples(base);
  const [callerFilter, setCallerFilter] = useState("");

  const stats = useApiLogStats();
  const recent = useRecentApiCalls(callerFilter || undefined, 50);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-headline text-3xl font-bold text-on-surface tracking-tight mb-2">
          API Console
        </h1>
        <p className="text-on-surface-variant text-lg">
          Read-only REST API for scripts, scheduled jobs, and MCP servers on
          the Tailnet. Auto-generated docs and live usage stats live below.
        </p>
      </header>

      {/* Endpoints / docs */}
      <section className="bg-surface-container rounded-xl p-6 border border-outline-variant/10 space-y-4">
        <h3 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">api</span>
          Base URL & docs
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-outline mb-1">
              Base URL
            </div>
            <CopyableCommand value={base} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-outline mb-1">
              Interactive docs
            </div>
            <a
              href="/api/v1/docs"
              target="_blank"
              rel="noreferrer"
              className="block text-primary text-sm font-mono p-3 bg-surface-container-lowest border border-outline-variant/10 rounded-lg hover:border-primary transition-colors"
            >
              /api/v1/docs <span className="material-symbols-outlined text-xs align-middle">open_in_new</span>
            </a>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-outline mb-1">
              Raw OpenAPI JSON
            </div>
            <a
              href="/api/v1/openapi.json"
              target="_blank"
              rel="noreferrer"
              className="block text-primary text-sm font-mono p-3 bg-surface-container-lowest border border-outline-variant/10 rounded-lg hover:border-primary transition-colors"
            >
              /api/v1/openapi.json <span className="material-symbols-outlined text-xs align-middle">open_in_new</span>
            </a>
          </div>
        </div>
      </section>

      {/* Quick start examples */}
      <section className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
        <h3 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary">terminal</span>
          Quick start
        </h3>
        <div className="space-y-4">
          {examples.map((ex) => (
            <div key={ex.title}>
              <div className="text-sm font-bold text-on-surface mb-0.5">
                {ex.title}
              </div>
              <div className="text-xs text-outline mb-1.5">{ex.description}</div>
              <CopyableCommand value={ex.cmd} />
            </div>
          ))}
        </div>
      </section>

      {/* Live stats */}
      <section className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
        <h3 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary">monitoring</span>
          Usage (last 24 hours)
        </h3>
        {stats.isLoading ? (
          <div className="text-outline text-sm">Loading…</div>
        ) : stats.data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              label="Total calls"
              value={stats.data.totalCalls.toLocaleString()}
              sub={`${stats.data.uniqueCallers} caller${stats.data.uniqueCallers === 1 ? "" : "s"}`}
            />
            <StatTile
              label="Avg latency"
              value={
                stats.data.avgDurationMs != null
                  ? `${stats.data.avgDurationMs} ms`
                  : "—"
              }
              sub={
                stats.data.p95DurationMs != null
                  ? `p95 ${stats.data.p95DurationMs} ms`
                  : undefined
              }
            />
            <StatTile
              label="Error rate"
              value={`${(stats.data.errorRate * 100).toFixed(1)}%`}
              sub={`${stats.data.errorCount} 5xx`}
              tone={
                stats.data.errorRate > 0.05
                  ? "bad"
                  : stats.data.errorRate > 0
                    ? "warn"
                    : "good"
              }
            />
            <StatTile
              label="Top caller"
              value={
                stats.data.byCaller[0]?.caller ??
                (stats.data.byCaller[0] != null ? "anonymous" : "—")
              }
              sub={
                stats.data.byCaller[0]
                  ? `${stats.data.byCaller[0].count.toLocaleString()} calls`
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="text-outline text-sm">No data yet — try one of the curl examples above.</div>
        )}
      </section>

      {/* Recent requests */}
      <section className="bg-surface-container rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="p-6 flex items-center justify-between gap-4 border-b border-outline-variant/10">
          <h3 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">list</span>
            Recent requests
          </h3>
          <input
            type="text"
            value={callerFilter}
            onChange={(e) => setCallerFilter(e.target.value)}
            placeholder="Filter by caller…"
            className="bg-surface-container-lowest border border-outline-variant/10 rounded-md px-3 py-1.5 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10">
                <th className="text-left py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider">When</th>
                <th className="text-left py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider">Caller</th>
                <th className="text-left py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider">Path</th>
                <th className="text-right py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider">Status</th>
                <th className="text-right py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider">Duration</th>
              </tr>
            </thead>
            <tbody>
              {recent.data && recent.data.length > 0 ? (
                recent.data.map((row) => {
                  const isErr = row.statusCode >= 500;
                  const is4xx = row.statusCode >= 400 && row.statusCode < 500;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-outline-variant/5 hover:bg-surface-container-high transition-colors"
                    >
                      <td
                        className="py-2 px-6 text-on-surface-variant tabular-nums whitespace-nowrap"
                        title={row.createdAt}
                      >
                        {relativeAgo(row.createdAt)}
                      </td>
                      <td className="py-2 px-6 text-on-surface font-mono text-xs">
                        {row.caller ?? <span className="text-outline italic">anonymous</span>}
                      </td>
                      <td className="py-2 px-6 text-on-surface font-mono text-xs">
                        {row.method} {row.path}
                      </td>
                      <td className="text-right py-2 px-6 tabular-nums">
                        <span
                          className={`text-xs font-bold ${
                            isErr
                              ? "text-error"
                              : is4xx
                                ? "text-tertiary"
                                : "text-secondary"
                          }`}
                        >
                          {row.statusCode}
                        </span>
                      </td>
                      <td className="text-right py-2 px-6 text-on-surface-variant tabular-nums">
                        {row.durationMs} ms
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-outline">
                    {recent.isLoading ? "Loading…" : "No recent requests."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
