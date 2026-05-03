import { useHealthCheck } from "../api/queries";
import { useUnitsStore } from "../stores/unitsStore";
import type { UnitSystem } from "../lib/units";

const connectedSources = [
  { name: "Fitbit", icon: "watch", color: "#00B0B9", connected: true, lastSync: "14m ago" },
  { name: "Apple Health", icon: "ios", color: "#ffffff", connected: false, lastSync: null },
  { name: "Garmin Connect", icon: "watch", color: "#908fa0", connected: false, lastSync: null },
];

function SourceCard({
  source,
}: {
  source: typeof connectedSources[number];
}) {
  return (
    <div
      className={`bg-surface-container-high p-5 rounded-xl flex items-center justify-between group hover:bg-surface-bright transition-all ${
        !source.connected ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-surface-container-lowest flex items-center justify-center border border-outline-variant/10">
          <span className="material-symbols-outlined" style={{ color: source.color }}>
            {source.icon}
          </span>
        </div>
        <div>
          <div className="font-semibold text-on-surface">{source.name}</div>
          <div className="text-[11px] text-outline font-mono tabular-nums">
            {source.connected ? `Synced ${source.lastSync}` : "Not connected"}
          </div>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="sr-only peer"
          defaultChecked={source.connected}
        />
        <div className="w-10 h-5 bg-surface-container-lowest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary" />
      </label>
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
          {/* Connected Sources */}
          <div className="bg-surface-container rounded-xl p-8 border border-outline-variant/10">
            <header className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-headline text-xl font-bold text-on-surface">
                  Connected Sources
                </h3>
                <p className="text-outline text-sm">
                  Cloud-sync state for health peripherals.
                </p>
              </div>
              <button className="text-primary font-semibold text-sm hover:underline">
                Add Service
              </button>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {connectedSources.map((source) => (
                <SourceCard key={source.name} source={source} />
              ))}
            </div>
          </div>

          {/* Data Management */}
          <div className="bg-surface-container rounded-xl p-8 border border-outline-variant/10">
            <header className="mb-6">
              <h3 className="font-headline text-xl font-bold text-on-surface">
                Data Management
              </h3>
              <p className="text-outline text-sm">
                Configure data retention and export settings.
              </p>
            </header>
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-lg bg-surface-container-low border border-outline-variant/5">
                <div className="flex-1">
                  <div className="text-sm font-bold text-on-surface-variant uppercase tracking-tighter mb-1">
                    Data Retention
                  </div>
                  <p className="text-sm text-on-surface">
                    Keep historical data for up to{" "}
                    <select className="bg-surface-container-lowest border-none text-primary font-bold rounded-md py-1 text-sm focus:ring-1 focus:ring-primary mx-1">
                      <option>1 year</option>
                      <option>2 years</option>
                      <option selected>5 years</option>
                      <option>Forever</option>
                    </select>
                  </p>
                </div>
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-lg bg-surface-container-low border border-outline-variant/5">
                <div className="flex-1">
                  <div className="text-sm font-bold text-on-surface-variant uppercase tracking-tighter mb-1">
                    Export Format
                  </div>
                  <p className="text-sm text-on-surface">
                    Default export format:{" "}
                    <select className="bg-surface-container-lowest border-none text-primary font-bold rounded-md py-1 text-sm focus:ring-1 focus:ring-primary mx-1">
                      <option selected>CSV</option>
                      <option>JSON</option>
                      <option>Parquet</option>
                    </select>
                  </p>
                </div>
              </div>
            </div>
            <div className="pt-6 flex justify-end gap-4">
              <button className="px-6 py-2.5 text-sm font-bold text-outline hover:text-on-surface transition-colors">
                Reset Defaults
              </button>
              <button className="px-8 py-2.5 bg-linear-to-br from-primary to-primary-container text-on-primary-fixed font-bold rounded-lg shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">
                Save Config
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
