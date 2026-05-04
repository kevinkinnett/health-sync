import { useState } from "react";
import { useApiLogStats, useRecentApiCalls } from "../api/queries";

/**
 * Base URL the dashboard advertises in the Quick Start card.
 *
 * In production the API is served by the same Express process the
 * dashboard runs in (see `index.ts`), so the v1 surface is always at
 * `${origin}/api/v1`. Showing the live origin (rather than a static
 * Tailscale hostname) makes the curl examples Just Work whether the
 * page was opened via Tailscale, localhost, or a LAN IP.
 */
function apiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/v1`;
}

interface CurlExample {
  title: string;
  description: string;
  cmd: string;
}

function buildExamples(base: string): CurlExample[] {
  return [
    {
      title: "Latest health snapshot",
      description: "One call returns latest values + 30-day sparklines for every metric.",
      cmd: `curl ${base}/summary`,
    },
    {
      title: "Activity over the last month",
      description: "Per-day steps, distance, calories, active minutes for a window.",
      cmd: `curl "${base}/activity?start=2026-04-04&end=2026-05-04"`,
    },
    {
      title: "Personal records and current streaks",
      description: "All-time bests + active streaks (today's in-progress day is skipped).",
      cmd: `curl ${base}/records`,
    },
    {
      title: "Supplement → health correlations",
      description: "Pearson r between an item's intake signal and each metric, with optional day lag.",
      cmd: `curl "${base}/supplements/correlations?itemId=7&lag=1"`,
    },
    {
      title: "Identify your script (recommended)",
      description: "Pass an X-Caller header so your calls show up tagged in the recent-requests table below.",
      cmd: `curl -H "X-Caller: my-script" ${base}/summary`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        // navigator.clipboard requires a secure context (HTTPS or
        // localhost). Tailscale's MagicDNS provides HTTPS so this is
        // the common path; fall back to silent no-op if unavailable.
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      aria-label={label}
      className={`p-1.5 rounded transition-colors ${
        copied
          ? "text-secondary"
          : "text-outline hover:text-primary hover:bg-surface-container"
      }`}
    >
      <span className="material-symbols-outlined text-base">
        {copied ? "check" : "content_copy"}
      </span>
    </button>
  );
}

function CodeBlock({ value, copyLabel }: { value: string; copyLabel: string }) {
  return (
    <div className="relative">
      <pre className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg p-3 pr-12 text-xs font-mono text-on-surface-variant overflow-x-auto whitespace-pre">
        {value}
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={value} label={copyLabel} />
      </div>
    </div>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest font-bold text-outline mb-2">
      {children}
    </div>
  );
}

function ExternalLinkPanel({
  label,
  href,
  display,
}: {
  label: string;
  href: string;
  display: string;
}) {
  return (
    <div>
      <PanelLabel>{label}</PanelLabel>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-primary text-sm font-mono p-3 bg-surface-container-lowest border border-outline-variant/10 rounded-lg hover:border-primary transition-colors"
      >
        <span className="truncate">{display}</span>
        <span className="material-symbols-outlined text-xs shrink-0">
          open_in_new
        </span>
      </a>
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

// ---------------------------------------------------------------------------
// Quick Start card — panels + helper + curl examples
// ---------------------------------------------------------------------------

function QuickStartCard({ base }: { base: string }) {
  const examples = buildExamples(base);

  return (
    <section className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
      <h3 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2 mb-5">
        <span className="material-symbols-outlined text-primary">terminal</span>
        Quick Start
      </h3>

      {/* Top row: 3 side-by-side panels (stack on mobile, 3-col from sm:) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <PanelLabel>Base URL</PanelLabel>
          <CodeBlock value={base} copyLabel="Copy base URL" />
        </div>
        <ExternalLinkPanel
          label="Interactive docs (Swagger UI)"
          href="/api/v1/docs"
          display={`${base}/docs`}
        />
        <ExternalLinkPanel
          label="OpenAPI spec (JSON)"
          href="/api/v1/openapi.json"
          display={`${base}/openapi.json`}
        />
      </div>

      {/* Helper line — explains the no-auth + X-Caller idiom */}
      <p className="text-xs text-outline mb-6">
        All v1 endpoints are read-only and require no auth — access is gated by
        Tailnet membership. Pass an{" "}
        <code className="bg-surface-container-lowest border border-outline-variant/10 rounded px-1.5 py-0.5 font-mono text-on-surface-variant">
          X-Caller
        </code>{" "}
        header to tag your script's calls in the table below.
      </p>

      {/* Curl examples — vertical stack of header + code block */}
      <div className="space-y-4">
        {examples.map((ex) => (
          <div key={ex.title}>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-1.5">
              <div className="text-sm font-bold text-on-surface">{ex.title}</div>
              <div className="text-xs text-outline">{ex.description}</div>
            </div>
            <CodeBlock value={ex.cmd} copyLabel={`Copy: ${ex.title}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ApiConsole() {
  const base = apiBaseUrl();
  const [callerFilter, setCallerFilter] = useState("");
  const [recentLimit, setRecentLimit] = useState(50);

  const stats24h = useApiLogStats(24);
  const stats7d = useApiLogStats(7 * 24);
  const recent = useRecentApiCalls(callerFilter || undefined, recentLimit);

  return (
    <div className="space-y-6">
      <header className="mb-2 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="font-headline text-3xl font-bold text-on-surface tracking-tight mb-2">
            API Console
          </h1>
          <p className="text-on-surface-variant text-lg">
            Read-only REST API for scripts, scheduled jobs, and MCP servers on
            the Tailnet. Auto-generated docs and live usage stats below.
          </p>
        </div>
        {/* Top-right corner link — full URL so it works copied or clicked */}
        <a
          href="/api/v1/docs"
          target="_blank"
          rel="noreferrer"
          className="text-primary text-sm font-mono hover:underline whitespace-nowrap shrink-0"
          title={`${base}/docs`}
        >
          Swagger UI →
        </a>
      </header>

      <QuickStartCard base={base} />

      {/* Stat tiles — last 24h */}
      <section className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
        <h3 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary">monitoring</span>
          Usage (last 24 hours)
        </h3>
        {stats24h.isLoading ? (
          <div className="text-outline text-sm">Loading…</div>
        ) : stats24h.data ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile
              label="24h calls"
              value={stats24h.data.totalCalls.toLocaleString()}
            />
            <StatTile
              label="Unique callers"
              value={stats24h.data.uniqueCallers.toLocaleString()}
              sub={
                stats24h.data.byCaller[0]
                  ? `top: ${stats24h.data.byCaller[0].caller ?? "anonymous"} (${stats24h.data.byCaller[0].count.toLocaleString()})`
                  : undefined
              }
            />
            <StatTile
              label="Avg response"
              value={
                stats24h.data.avgDurationMs != null
                  ? `${stats24h.data.avgDurationMs} ms`
                  : "—"
              }
              sub={
                stats24h.data.p95DurationMs != null
                  ? `p95 ${stats24h.data.p95DurationMs} ms`
                  : undefined
              }
            />
            <StatTile
              label="Error rate"
              value={`${(stats24h.data.errorRate * 100).toFixed(1)}%`}
              sub={`${stats24h.data.errorCount} 5xx`}
              tone={
                stats24h.data.errorRate > 0.05
                  ? "bad"
                  : stats24h.data.errorRate > 0
                    ? "warn"
                    : "good"
              }
            />
          </div>
        ) : (
          <div className="text-outline text-sm">
            No data yet — try one of the curl examples above.
          </div>
        )}
      </section>

      {/* Endpoints — last 7d, sorted by call count */}
      <section className="bg-surface-container rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="p-6 border-b border-outline-variant/10">
          <h3 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">api</span>
            Endpoints (7d)
          </h3>
          <p className="text-xs text-outline mt-1">
            Top paths by call count over the last week.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/10">
                <th className="text-left py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider">
                  Path
                </th>
                <th className="text-right py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider">
                  Calls
                </th>
                <th className="text-right py-3 px-6 text-outline font-semibold uppercase text-xs tracking-wider">
                  Avg duration
                </th>
              </tr>
            </thead>
            <tbody>
              {stats7d.data && stats7d.data.byPath.length > 0 ? (
                stats7d.data.byPath.map((row) => (
                  <tr
                    key={row.path}
                    className="border-b border-outline-variant/5 hover:bg-surface-container-high transition-colors"
                  >
                    <td className="py-2 px-6 text-on-surface font-mono text-xs">
                      {row.path}
                    </td>
                    <td className="text-right py-2 px-6 text-on-surface tabular-nums">
                      {row.count.toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-6 text-on-surface-variant tabular-nums">
                      {row.avgDurationMs} ms
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={3}
                    className="text-center py-8 text-outline"
                  >
                    {stats7d.isLoading ? "Loading…" : "No requests in the last 7 days."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent requests — caller filter + load-more */}
      <section className="bg-surface-container rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="p-6 flex items-center justify-between gap-4 border-b border-outline-variant/10">
          <h3 className="font-headline text-lg font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">list</span>
            Recent requests
          </h3>
          <input
            type="text"
            value={callerFilter}
            onChange={(e) => {
              setCallerFilter(e.target.value);
              setRecentLimit(50);
            }}
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
        {/* Load-more pagination — keeps it simple, server caps at 500. */}
        {recent.data && recent.data.length >= recentLimit && recentLimit < 500 && (
          <div className="border-t border-outline-variant/10 p-4 flex justify-center">
            <button
              onClick={() => setRecentLimit((n) => Math.min(500, n + 50))}
              className="text-primary text-sm font-bold uppercase tracking-wider hover:underline"
            >
              Load more
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
