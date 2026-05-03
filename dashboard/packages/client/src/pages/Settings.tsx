import { useHealthCheck, useIngestState } from "../api/queries";
import { useUnitsStore } from "../stores/unitsStore";
import type { UnitSystem } from "../lib/units";

/**
 * Compact human-friendly "synced N ago" string from a UTC timestamp.
 * Falls back to "—" when the timestamp is missing.
 */
function formatRelativeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/**
 * Read-only status display for connected ingest sources. Driven by the
 * real ingest_state rows so "last synced" is honest, not hardcoded.
 *
 * Source connections themselves are managed in Windmill (OAuth tokens
 * live there as resources), not in this UI — wiring up
 * connect/disconnect from the dashboard would require a sizeable auth
 * flow that doesn't yet exist. For now this card just reports the
 * truth: which sources are feeding the database and when each last
 * succeeded.
 */
function SourceStatusCard() {
  const ingest = useIngestState();
  const states = ingest.data ?? [];
  // Latest successful run across all Fitbit data types is the
  // best "last sync" signal we have.
  const lastSyncIso = states
    .map((s) => s.lastSuccessAtUtc)
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop() ?? null;
  const connected = lastSyncIso != null;

  return (
    <div className="bg-surface-container rounded-xl p-8 border border-outline-variant/10">
      <header className="mb-6">
        <h3 className="font-headline text-xl font-bold text-on-surface">
          Data Sources
        </h3>
        <p className="text-outline text-sm">
          Live ingest state for connected health peripherals. Connections
          are managed in Windmill — this card is read-only.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className={`bg-surface-container-high p-5 rounded-xl flex items-center gap-4 ${
            connected ? "" : "opacity-60"
          }`}
        >
          <div className="w-12 h-12 rounded-lg bg-surface-container-lowest flex items-center justify-center border border-outline-variant/10">
            <span
              className="material-symbols-outlined"
              style={{ color: "#00B0B9" }}
            >
              watch
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-on-surface">Fitbit</div>
            <div className="text-[11px] text-outline font-mono tabular-nums">
              {connected ? `Synced ${formatRelativeAgo(lastSyncIso)}` : "No syncs yet"}
            </div>
          </div>
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              connected
                ? "bg-secondary/10 text-secondary"
                : "bg-outline-variant/10 text-outline"
            }`}
          >
            {connected ? "Live" : "Idle"}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Display-only preference for measurement system. Stored in localStorage
 * via `useUnitsStore`; the canonical values in the DB and the API stay
 * in metric (kg, km) regardless. Flipping this re-renders every screen
 * that uses `formatWeight` / `formatDistance` / etc. — no refetch
 * needed since nothing about the data changes.
 */
function UnitsCard() {
  const { units, setUnits } = useUnitsStore();
  const options: { value: UnitSystem; label: string; sub: string }[] = [
    { value: "imperial", label: "Imperial", sub: "lb · mi · °F" },
    { value: "metric", label: "Metric", sub: "kg · km · °C" },
  ];

  return (
    <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
      <header className="mb-5">
        <h3 className="font-headline text-xl font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">straighten</span>
          Units
        </h3>
        <p className="text-outline text-sm">
          Switch the dashboard between imperial and metric. Stored data
          is unchanged — this only affects how values are displayed.
        </p>
      </header>
      <div
        role="radiogroup"
        aria-label="Measurement units"
        className="grid grid-cols-2 gap-3"
      >
        {options.map((opt) => {
          const active = units === opt.value;
          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={active}
              onClick={() => setUnits(opt.value)}
              className={`flex flex-col items-start gap-1 rounded-lg p-4 border text-left transition-all ${
                active
                  ? "bg-primary/10 border-primary text-on-surface"
                  : "bg-surface-container-low border-outline-variant/10 text-outline hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              <span className="font-bold text-sm uppercase tracking-wider">
                {opt.label}
              </span>
              <span
                className={`text-xs font-mono ${active ? "text-primary" : "text-outline"}`}
              >
                {opt.sub}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ApiConfigCard() {
  return (
    <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-headline text-lg font-semibold flex items-center gap-2 text-on-surface">
          <span className="material-symbols-outlined text-primary">terminal</span>
          API Configuration
        </h3>
        <span className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">
          Active
        </span>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-outline uppercase tracking-tighter mb-2 block">
            Server Endpoint
          </label>
          <div className="flex items-center gap-2 bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/10">
            <span className="text-on-surface-variant font-mono text-sm flex-1">
              http://localhost:3001/api
            </span>
            <button className="material-symbols-outlined text-outline hover:text-primary transition-colors">
              content_copy
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-outline uppercase tracking-tighter mb-2 block">
            Database Connection
          </label>
          <div className="flex items-center gap-2 bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/10">
            <span className="text-on-surface-variant font-mono text-sm flex-1">
              postgresql://••••••••@localhost:5432/universe
            </span>
            <button className="material-symbols-outlined text-outline hover:text-primary transition-colors">
              content_copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemHealthCard() {
  const health = useHealthCheck();
  const connected = health.data?.dbConnected === true;

  return (
    <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
      <h3 className="font-headline text-lg font-semibold text-on-surface mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-secondary">monitor_heart</span>
        System Health
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
          <div className="flex items-center gap-3">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-secondary" : "bg-error"}`} />
            <span className="text-sm text-on-surface">Database</span>
          </div>
          <span className={`text-xs font-bold uppercase tracking-wider ${connected ? "text-secondary" : "text-error"}`}>
            {health.isLoading ? "Checking..." : connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span className="text-sm text-on-surface">Windmill</span>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-secondary">Connected</span>
        </div>
        <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span className="text-sm text-on-surface">API Server</span>
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-secondary">Online</span>
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="mb-2">
        <h1 className="font-headline text-3xl font-bold text-on-surface tracking-tight mb-2">
          Console Settings
        </h1>
        <p className="text-on-surface-variant text-lg">
          Manage your data integrations and system-wide configurations.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column */}
        <section className="lg:col-span-4 space-y-6">
          <SystemHealthCard />
          <UnitsCard />
          <ApiConfigCard />
        </section>

        {/* Right column */}
        <section className="lg:col-span-8 space-y-6">
          <SourceStatusCard />
        </section>
      </div>
    </div>
  );
}
