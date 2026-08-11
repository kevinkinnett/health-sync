import { useEffect, useRef, useState } from "react";
import type { AlertSeverity, HealthAlert } from "@health-dashboard/shared";
import { useAlerts, useMarkAlertsRead } from "../api/queries";
import { formatRelativeAgo } from "../lib/relativeTime";
import { Link } from "react-router-dom";
import { alertAction } from "../lib/alertActions";

/**
 * The notification bell in the top bar: an unread badge + a dropdown
 * listing recent proactive alerts. Marks everything read when opened
 * (so the badge reflects "things you haven't seen"). Detection +
 * delivery happen server-side / via the scheduled Windmill job; this
 * is just the in-app surface.
 */

const SEVERITY_DOT: Record<AlertSeverity, string> = {
  alert: "bg-error",
  warn: "bg-tertiary",
  info: "bg-outline",
};

export function AlertBell() {
  const { data } = useAlerts(8);
  const markRead = useMarkAlertsRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const alerts = data?.alerts ?? [];
  const unread = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Opening the panel acknowledges the unread ones.
    if (next && unread > 0) markRead.mutate();
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        className="text-outline hover:text-on-surface transition-colors p-1 relative"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-error text-on-error text-[10px] font-bold flex items-center justify-center"
            data-testid="alert-badge"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 top-10 w-80 max-h-96 overflow-y-auto bg-surface-container-high rounded-xl border border-outline-variant/15 shadow-xl z-50"
        >
          <div className="px-4 py-3 border-b border-outline-variant/10">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-on-surface">Alerts</span>
              <Link
                to="/alerts"
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                View history
              </Link>
            </div>
          </div>
          {alerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-outline">
              No alerts — your recovery signals look normal.
            </div>
          ) : (
            <ul>
              {alerts.map((a) => (
                <AlertRow key={a.id} alert={a} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: HealthAlert }) {
  const action = alertAction(alert.kind);
  return (
    <li className="px-4 py-3 border-b border-outline-variant/5 last:border-0">
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[alert.severity]}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-on-surface">
            {alert.title}
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">{alert.detail}</p>
          <div className="text-[10px] text-outline mt-1 tabular-nums">
            {formatRelativeAgo(alert.createdAt)}
          </div>
          <Link
            to={action.to}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            {action.label}
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
