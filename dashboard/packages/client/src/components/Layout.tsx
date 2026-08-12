import { useEffect, useRef, useState } from "react";
import { BuildStamp } from "./BuildStamp";
import { BuildCompatibilityGate } from "./BuildCompatibilityGate";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useDateRangeStore } from "../stores/dateRangeStore";
import { useUserTimezone } from "../api/queries";
import { AlertBell } from "./AlertBell";
import {
  allNavItems,
  analyzeNavItems,
  bottomNavQuickItems,
  navSections,
} from "./navigation";
import { DateRangePresets } from "./ui/DateRangePresets";

/**
 * Render the sectioned link list. Shared by `<SideNav>` (desktop rail)
 * and `<MobileMenu>` (mobile drawer) so the two cannot drift apart —
 * this is the runtime guarantee behind the nav-parity test.
 */
function NavSections({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
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
              onClick={onNavigate}
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
    </>
  );
}

function SideNav() {
  return (
    <aside className="hidden xl:flex flex-col h-screen w-64 fixed left-0 top-0 bg-surface-container-low border-r border-outline-variant/15 z-40 pt-20">
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
              Vitalis
            </p>
            <p className="text-outline text-[10px] uppercase tracking-widest font-semibold">
              Personal health
            </p>
          </div>
        </div>
      </div>

      {/* Sectioned nav links — scroll independently if the rail overflows. */}
      <nav
        aria-label="Primary navigation"
        data-testid="primary-nav"
        className="flex-1 px-4 overflow-y-auto space-y-5 pb-4"
      >
        <NavSections />
      </nav>

      {/* Footer */}
      <div className="border-t border-outline-variant/10 px-4 py-3 space-y-1">
        <BuildStamp />
      </div>
    </aside>
  );
}

/**
 * A compact rail for tablet and small-laptop widths. These viewports have
 * enough horizontal space for persistent navigation, but not enough to give
 * the full 16rem sidebar a useful share of the screen.
 */
function CompactRail({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <nav
      aria-label="Tablet navigation"
      data-testid="tablet-nav"
      className="fixed bottom-0 left-0 top-16 z-40 hidden w-20 flex-col items-center border-r border-outline-variant/35 bg-surface-container-low px-2 py-4 md:flex xl:hidden"
    >
      <div className="flex flex-1 flex-col items-center gap-2">
        {bottomNavQuickItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            aria-label={item.label}
            className={({ isActive }) =>
              `flex min-h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors ${
                isActive
                  ? "bg-primary/12 text-primary"
                  : "text-outline hover:bg-surface-container-high hover:text-on-surface"
              }`
            }
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="text-[9px] font-bold uppercase tracking-wide">{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={onOpenMenu}
          title="More"
          aria-label="Open tablet menu"
          className="flex min-h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-outline transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <span className="material-symbols-outlined">menu</span>
          <span className="text-[9px] font-bold uppercase tracking-wide">More</span>
        </button>
      </div>
      <NavLink
        to="/settings"
        aria-label="Settings"
        title="Settings"
        className={({ isActive }) =>
          `flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
            isActive ? "bg-primary/12 text-primary" : "text-outline hover:bg-surface-container-high hover:text-on-surface"
          }`
        }
      >
        <span className="material-symbols-outlined">settings</span>
      </NavLink>
    </nav>
  );
}

/**
 * Mobile slide-in drawer that mirrors the desktop sidebar item-for-item.
 * Triggered by the "More" button on the bottom nav. Closes on backdrop
 * click, Escape key, or selecting any nav link (handled via the
 * `onNavigate` prop on `<NavSections>`).
 */
function MobileMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="xl:hidden fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] bg-surface-container-low border-r border-outline-variant/15 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
          <span className="text-sm font-bold text-primary tracking-wide">
            Vitalis
          </span>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close menu"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-outline hover:bg-surface-container-high hover:text-on-surface"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <nav
          aria-label="Mobile menu"
          data-testid="mobile-menu-nav"
          className="flex-1 px-4 py-3 overflow-y-auto space-y-5"
        >
          <NavSections onNavigate={onClose} />
        </nav>
      </div>
    </div>
  );
}

function TopBar() {
  const location = useLocation();

  // Pick the longest path-prefix match so a deep route like
  // "/analytics/activity" is reported as "Activity" rather than
  // bubbling up to a shorter "/analytics" entry.
  const pageTitle = location.pathname === "/alerts" ? "Alert History" :
    [...allNavItems, ...analyzeNavItems]
      .filter((n) =>
        n.end ? location.pathname === n.to : location.pathname.startsWith(n.to),
      )
      .sort((a, b) => b.to.length - a.to.length)[0]?.label ?? "Dashboard";
  const showDateRange =
    location.pathname.startsWith("/analytics/");

  return (
    <header className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-outline-variant/20 bg-surface/90 px-4 py-2.5 glass sm:px-6 md:pl-[calc(5rem+1.5rem)] xl:pl-[calc(16rem+1.5rem)]">
      <div className="flex items-center gap-6">
        <span className="text-xl font-bold tracking-tight text-primary font-headline">
          VITALIS
        </span>
        <span data-testid="page-title" className="hidden md:block text-on-surface-variant text-sm font-medium">
          {pageTitle}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Date range presets */}
        {showDateRange && <DateRangePresets className="hidden sm:grid" />}

        {/* Icons */}
        <AlertBell />
        <NavLink
          to="/settings"
          aria-label="Settings"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-outline transition-colors hover:bg-surface-container-low hover:text-on-surface"
        >
          <span className="material-symbols-outlined">settings</span>
        </NavLink>
      </div>
    </header>
  );
}

function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <nav
      aria-label="Quick access"
      className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-outline-variant/35 bg-surface-container-low/95 px-4 pb-6 pt-3 glass md:hidden"
    >
      {bottomNavQuickItems.map((item) => (
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
      {/* "More" — opens the full nav drawer (everything in `navSections`). */}
      <button
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="flex flex-col items-center justify-center px-4 py-1 rounded-xl transition-all active:scale-90 text-outline hover:text-primary"
      >
        <span className="material-symbols-outlined">menu</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider mt-1">
          More
        </span>
      </button>
    </nav>
  );
}

/**
 * Reconciles the date-range store's TZ with the server-configured user
 * TZ once `/api/config` resolves. Until then the store uses the browser
 * TZ as a sensible default — for users in their home zone the two match,
 * but if they ever differ (travel, shared accounts) the store will shift
 * to the configured zone on first config load.
 */
function useTzReconciliation(): void {
  const tz = useUserTimezone();
  const setTz = useDateRangeStore((s) => s.setTz);
  useEffect(() => {
    setTz(tz);
  }, [tz, setTz]);
}

export function Layout() {
  useTzReconciliation();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-surface">
      <TopBar />
      <SideNav />
      <CompactRail onOpenMenu={() => setMenuOpen(true)} />
      <BottomNav onOpenMenu={() => setMenuOpen(true)} />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      <main className="min-w-0 px-4 pb-24 pt-16 md:pl-[calc(5rem+2rem)] md:pr-8 md:pb-8 xl:pl-[calc(16rem+2rem)]">
        <div className="min-w-0 max-w-7xl mx-auto mt-4">
          <BuildCompatibilityGate>
            <Outlet />
          </BuildCompatibilityGate>
        </div>
      </main>
    </div>
  );
}
