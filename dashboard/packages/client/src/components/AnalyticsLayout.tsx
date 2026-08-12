import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { analyzeNavItems } from "./navigation";
import { DateRangePresets } from "./ui/DateRangePresets";

const trendViews = analyzeNavItems.filter((item) => item.to.startsWith("/analytics/"));

export function AnalyticsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = trendViews.find((item) => item.to === location.pathname) ?? trendViews[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-outline-variant/10 bg-surface-container-low p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Explore</p>
          <h1 className="font-headline text-2xl font-bold tracking-tight text-on-surface mt-1">{current.label}</h1>
          <p className="max-w-xl text-sm text-on-surface-variant mt-1">{current.description}</p>
        </div>
        <label className="sm:min-w-64">
          <span className="sr-only">Explore health view</span>
          <select
            aria-label="Explore health view"
            value={current.to}
            onChange={(event) => navigate(event.target.value)}
            className="w-full rounded-xl border border-outline-variant/20 bg-surface-container px-4 py-3 text-sm font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/60"
          >
            {trendViews.map((view) => (
              <option key={view.to} value={view.to}>{view.label}</option>
            ))}
          </select>
        </label>
      </header>
      <DateRangePresets className="sm:hidden" label="Analytics date range" />
      <Outlet />
    </div>
  );
}
