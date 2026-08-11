import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { AlertSeverity, HealthAlert } from "@health-dashboard/shared";
import { useAlerts, useMarkAlertRead, useMarkAlertsRead } from "../api/queries";
import { PageError, PageSkeleton } from "../components/ui/PageState";
import { alertAction, type AlertCategory } from "../lib/alertActions";
import { formatRelativeAgo } from "../lib/relativeTime";

type Filter = "all" | AlertCategory;
type EpisodeFilter = "current" | "history" | "all";

const SEVERITY_STYLE: Record<AlertSeverity, string> = {
  alert: "bg-error/10 text-error border-error/20",
  warn: "bg-tertiary/10 text-tertiary border-tertiary/20",
  info: "bg-secondary/10 text-secondary border-secondary/20",
};

export function Alerts() {
  const query = useAlerts(200);
  const markRead = useMarkAlertsRead();
  const markOneRead = useMarkAlertRead();
  const [filter, setFilter] = useState<Filter>("all");
  const [episodeFilter, setEpisodeFilter] = useState<EpisodeFilter>("current");
  const alerts = useMemo(() => query.data?.alerts ?? [], [query.data?.alerts]);
  const visible = useMemo(
    () => alerts.filter((alert) => {
      const categoryMatches = filter === "all" || alertAction(alert.kind).category === filter;
      const episodeMatches = episodeFilter === "all"
        || (episodeFilter === "current" ? alert.resolvedAt == null : alert.resolvedAt != null);
      return categoryMatches && episodeMatches;
    }),
    [alerts, episodeFilter, filter],
  );
  if (query.isLoading) return <PageSkeleton />;
  if (query.isError) {
    return (
      <PageError
        title="Alert history is temporarily unavailable"
        message="Vitalis could not load the alert log. Your health data and pipeline have not been changed."
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Operations & recovery</p>
          <h1 className="mt-1 font-headline text-3xl font-semibold text-on-surface">Alert history</h1>
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant">
            A durable record of health signals and data-pipeline interruptions, with the next useful action attached.
          </p>
        </div>
        {(query.data?.unreadCount ?? 0) > 0 && (
          <button
            onClick={() => markRead.mutate()}
            disabled={markRead.isPending}
            className="rounded-xl border border-outline-variant/20 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            {markRead.isPending ? "Marking read…" : `Mark ${query.data?.unreadCount} as read`}
          </button>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Alert summary">
        <SummaryCard label="Open" value={query.data?.openCount ?? alerts.filter((alert) => alert.resolvedAt == null).length} icon="notifications_active" />
        <SummaryCard label="Unread" value={query.data?.unreadCount ?? 0} icon="mark_email_unread" />
        <SummaryCard label="Recorded" value={alerts.length} icon="history" />
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2" aria-label="Filter alert episodes">
          {(["current", "history", "all"] as EpisodeFilter[]).map((value) => (
            <button
              key={value}
              onClick={() => setEpisodeFilter(value)}
              aria-pressed={episodeFilter === value}
              className={`rounded-full px-4 py-2 text-xs font-bold capitalize transition-colors ${
                episodeFilter === value
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <span aria-hidden="true" className="hidden h-6 w-px bg-outline-variant/20 sm:block" />
        <div className="flex flex-wrap gap-2" aria-label="Filter alert category">
          {(["all", "health", "pipeline"] as Filter[]).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-full px-4 py-2 text-xs font-bold capitalize transition-colors ${
              filter === value
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {value === "all" ? "All categories" : value}
          </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-10 text-center">
          <span className="material-symbols-outlined text-3xl text-secondary">check_circle</span>
          <h2 className="mt-2 font-headline text-xl font-semibold text-on-surface">No matching alerts</h2>
          <p className="mt-1 text-sm text-on-surface-variant">There are no events in this category yet.</p>
        </div>
      ) : (
        <ol className="space-y-3" aria-label="Alert events">
          {visible.map((alert) => (
            <AlertEvent
              key={alert.id}
              alert={alert}
              acknowledging={markOneRead.isPending && markOneRead.variables === alert.id}
              onAcknowledge={() => markOneRead.mutate(alert.id)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-outline">{label}</span>
        <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
      </div>
      <div className="mt-2 font-headline text-3xl font-semibold tabular-nums text-on-surface">{value}</div>
    </div>
  );
}

function AlertEvent({
  alert,
  acknowledging,
  onAcknowledge,
}: {
  alert: HealthAlert;
  acknowledging: boolean;
  onAcknowledge: () => void;
}) {
  const action = alertAction(alert.kind);
  const isOpen = alert.resolvedAt == null;
  return (
    <li className="rounded-2xl border border-outline-variant/15 bg-surface-container-low p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${SEVERITY_STYLE[alert.severity]}`}>
          <span className="material-symbols-outlined text-[22px]">{action.icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-on-surface">{alert.title}</h2>
            {alert.readAt == null && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">New</span>}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isOpen ? "bg-tertiary/10 text-tertiary" : "bg-secondary/10 text-secondary"}`}>
              {isOpen ? "Open" : "Resolved"}
            </span>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 text-[10px] font-bold uppercase text-outline">{action.category}</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">{alert.detail}</p>
          <p className="mt-2 text-xs text-outline">{action.guidance}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <span className="tabular-nums text-outline">
              {alert.date} · {formatRelativeAgo(alert.createdAt)}
              {alert.occurrenceCount > 1 ? ` · observed ${alert.occurrenceCount} times` : ""}
            </span>
            <Link to={action.to} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              {action.label}
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
            {alert.readAt == null && (
              <button
                type="button"
                onClick={onAcknowledge}
                disabled={acknowledging}
                className="font-semibold text-on-surface-variant hover:text-primary disabled:opacity-50"
              >
                {acknowledging ? "Acknowledging…" : "Acknowledge"}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
