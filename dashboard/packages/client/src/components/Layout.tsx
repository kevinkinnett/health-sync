import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useDateRangeStore, type PresetRange } from "../stores/dateRangeStore";

const presets: { label: string; value: PresetRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

interface NavLinkDef {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

interface NavSectionDef {
  /** Optional small-caps section label (omit for the very first section). */
  header?: string;
  items: NavLinkDef[];
}

/**
 * Sectioned left-rail nav. Each analytics screen has its own deep
 * link under the "Analyze" header so users can jump straight there
 * without going through the parent /analytics route.
 *
 * The "Track" section is the intake-logging UI (where you actually
 * record a dose), separated from the analytics views that report on
 * those doses to keep the two intents from blurring.
 */
const navSections: NavSectionDef[] = [
  {
    items: [{ to: "/", label: "Dashboard", icon: "dashboard", end: true }],
  },
  {
    header: "Analyze",
    items: [
      { to: "/analytics/overview", label: "Overview", icon: "insights" },
      { to: "/analytics/activity", label: "Activity", icon: "footprint" },
      { to: "/analytics/sleep", label: "Sleep", icon: "bedtime" },
      { to: "/analytics/heart-rate", label: "Heart Rate", icon: "favorite" },
      { to: "/analytics/hrv", label: "HRV", icon: "monitor_heart" },
      { to: "/analytics/weight", label: "Weight", icon: "scale" },
      { to: "/analytics/exercises", label: "Exercises", icon: "exercise" },
      { to: "/analytics/records", label: "Records", icon: "emoji_events" },
      {
        to: "/analytics/correlations",
        label: "Correlations",
        icon: "scatter_plot",
      },
      {
        to: "/analytics/supplements",
        label: "Supplements",
        icon: "medication",
      },
      {
        to: "/analytics/medications",
        label: "Medications",
        icon: "prescriptions",
      },
    ],
  },
  {
    header: "Track",
    items: [
      { to: "/supplements", label: "Supplement Log", icon: "edit_note" },
      { to: "/medications", label: "Medication Log", icon: "edit_note" },
    ],
  },
  {
    header: "System",
    items: [
      {
        to: "/ingest",
        label: "Data Pipeline",
        icon: "settings_input_component",
      },
      { to: "/settings", label: "Console Settings", icon: "settings" },
    ],
  },
];

const allNavItems: NavLinkDef[] = navSections.flatMap((s) => s.items);

const mobileItems: NavLinkDef[] = [
  { to: "/", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/analytics/overview", label: "Analytics", icon: "query_stats" },
  { to: "/ingest", label: "Pipeline", icon: "settings_input_component" },
];

function SideNav() {
  return (
    <aside className="hidden lg:flex flex-col h-screen w-64 fixed left-0 top-0 bg-surface-container-low border-r border-outline-variant/15 z-40 pt-20">
      {/* Brand */}
      <div className="px-4 mb-6">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center">
            <span
              className="material-symbols-outlined text-on-primary"
              style={{ fontVariationSettings: "'FILL' 1", fontSize: 18 }}
            >
              favorite
            </span>
          </div>
          <div>
            <p className="text-primary font-bold font-body text-sm leading-tight">
              Health OS
            </p>
            <p className="text-outline text-[10px] uppercase tracking-widest font-semibold">
              Precision Curator
            </p>
          </div>
        </div>
      </div>

      {/* Sectioned nav links — scroll independently if the rail overflows. */}
      <nav className="flex-1 px-4 overflow-y-auto space-y-5 pb-4">
        {navSections.map((section, idx) => (
          <div key={section.header ?? `section-${idx}`} className="space-y-1">
            {section.header && (
              <p className="px-3 mb-1 text-[10px] uppercase font-bold tracking-widest text-outline">
                {section.header}
              </p>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-surface-container-high text-primary border-l-4 border-primary"
                      : "text-outline hover:bg-surface-container hover:text-on-surface"
                  }`
                }
              >
                <span className="material-symbols-outlined text-[20px]">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-outline-variant/10 px-4 py-3 space-y-1">
        <a
          href="#"
          className="flex items-center gap-3 px-3 py-2 text-outline hover:text-on-surface text-sm transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">help</span>
          Support
        </a>
      </div>
    </aside>
  );
}

function TopBar() {
  const { preset, setPreset } = useDateRangeStore();
  const location = useLocation();

  // Pick the longest path-prefix match so a deep route like
  // "/analytics/activity" is reported as "Activity" rather than
  // bubbling up to a shorter "/analytics" entry.
  const pageTitle =
    [...allNavItems]
      .filter((n) =>
        n.end ? location.pathname === n.to : location.pathname.startsWith(n.to),
      )
      .sort((a, b) => b.to.length - a.to.length)[0]?.label ?? "Dashboard";

  return (
    <header className="fixed top-0 w-full z-50 bg-surface/80 glass flex justify-between items-center px-6 py-3 lg:pl-[calc(16rem+1.5rem)]">
      <div className="flex items-center gap-6">
        <span className="text-xl font-bold tracking-tight text-primary font-headline">
          VITALIS
        </span>
        <span className="hidden md:block text-on-surface-variant text-sm font-medium">
          {pageTitle}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Date range presets */}
        <div className="hidden sm:flex items-center gap-1 bg-surface-container-low px-1.5 py-1 rounded-xl border border-outline-variant/10">
          {presets.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                preset === p.value
                  ? "bg-primary text-on-primary-fixed"
                  : "text-outline hover:text-on-surface"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Icons */}
        <button className="text-outline hover:text-on-surface transition-colors p-1">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <NavLink
          to="/settings"
          className="text-outline hover:text-on-surface transition-colors p-1"
        >
          <span className="material-symbols-outlined">settings</span>
        </NavLink>
      </div>
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 bg-surface-container-low/90 glass border-t border-outline-variant/15">
      {mobileItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center px-4 py-1 rounded-xl transition-all active:scale-90 ${
              isActive
                ? "bg-primary-container/20 text-primary"
                : "text-outline hover:text-primary"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className="material-symbols-outlined"
                style={
                  isActive ? { fontVariationSettings: "'FILL' 1" } : undefined
                }
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider mt-1">
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  return (
    <div className="min-h-screen bg-surface">
      <TopBar />
      <SideNav />
      <BottomNav />
      <main className="pt-16 pb-24 lg:pb-8 lg:pl-64 px-4 md:px-8">
        <div className="max-w-7xl mx-auto mt-4">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
