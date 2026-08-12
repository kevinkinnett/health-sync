import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { analyticsUsesDateRange, analyzeNavItems } from "./navigation";
import { DateRangePresets } from "./ui/DateRangePresets";
import { PageHeader } from "./ui/PageHeader";

const trendViews = analyzeNavItems.filter((item) => item.to.startsWith("/analytics/"));

export function AnalyticsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = trendViews.find((item) => item.to === location.pathname) ?? trendViews[0];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Explore"
        title={current.label}
        description={current.description}
        action={<label className="block w-full sm:min-w-64">
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
        </label>}
      />
      {analyticsUsesDateRange(location.pathname) && (
        <DateRangePresets className="sm:hidden" label="Analytics date range" />
      )}
      <Outlet />
    </div>
  );
}
