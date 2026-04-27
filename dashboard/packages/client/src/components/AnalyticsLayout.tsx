import { NavLink, Outlet } from "react-router-dom";

const subNav = [
  { to: "overview", label: "Overview" },
  { to: "activity", label: "Activity" },
  { to: "sleep", label: "Sleep" },
  { to: "heart-rate", label: "Heart Rate" },
  { to: "hrv", label: "HRV" },
  { to: "weight", label: "Weight" },
  { to: "exercises", label: "Exercises" },
  { to: "records", label: "Records" },
  { to: "correlations", label: "Correlations" },
  { to: "supplements", label: "Supplements" },
  { to: "medications", label: "Medications" },
];

/**
 * Wraps every `/analytics/*` route. Renders the section header and
 * the horizontal pill-tab sub-nav (using {@link NavLink} so each pill
 * is a real, deep-linkable route — refresh and browser back/forward
 * stay on the active sub-screen).
 *
 * The pill styling exactly matches the previous in-page tab strip
 * inside `Explore.tsx` to preserve visual continuity.
 */
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
        <nav className="flex flex-wrap gap-1 p-1.5 bg-surface-container-low rounded-2xl border border-outline-variant/10">
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
