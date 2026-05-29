import { NavLink, Outlet } from "react-router-dom";
import { analyzeNavItems } from "./Layout";

/**
 * Wraps every `/analytics/*` route. On desktop the left sidebar is
 * the canonical nav for each sub-screen, so the in-page pill strip is
 * hidden at `lg:` breakpoint and only the section header + tagline
 * stay visible. On smaller viewports — where the sidebar collapses to
 * the bottom dock — the pill sub-nav reappears so users still have a
 * deep-linkable way to switch between metric views.
 *
 * The pill list is derived from `analyzeNavItems` (the same source
 * the desktop sidebar's "Analyze" section uses). Two parallel arrays
 * had a habit of drifting — same data, two declarations is exactly
 * the kind of duplication the audit flagged.
 *
 * The pill strip needs RELATIVE paths (`overview`, `activity`, …)
 * because it's nested under the `/analytics` route; we strip the
 * `/analytics/` prefix from the shared items here. The single AI
 * Insights entry that doesn't sit under `/analytics/` is filtered
 * out — it lives in the desktop section but doesn't belong on the
 * in-page sub-nav.
 */
const subNav = analyzeNavItems
  .filter((item) => item.to.startsWith("/analytics/"))
  .map((item) => ({
    to: item.to.replace(/^\/analytics\//, ""),
    label: item.label,
  }));

export function AnalyticsLayout() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight text-on-surface">
            Analytics
          </h1>
          <p className="text-on-surface-variant mt-1">
            Deep-dive metric views, records, correlations, and intake insights.
          </p>
        </div>
        <nav
          aria-label="Analytics sub-navigation"
          data-testid="analytics-subnav"
          className="lg:hidden flex flex-wrap gap-1 p-1.5 bg-surface-container-low rounded-2xl border border-outline-variant/10"
        >
          {subNav.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                  isActive
                    ? "bg-primary text-on-primary-fixed"
                    : "text-outline hover:text-on-surface"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <Outlet />
    </div>
  );
}
