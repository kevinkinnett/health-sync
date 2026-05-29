import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";
import type {
  ReadinessBand,
  ReadinessComponent,
  ReadinessScore,
} from "@health-dashboard/shared";

/**
 * The morning-glance instrument: one big "how recovered am I today"
 * number with its band, a one-line read, a 14-day trend sparkline, and
 * the signals driving it. Reframes the dashboard from rearview charts
 * toward "what should I do today" (roadmap #2).
 *
 * Rendered from `useReadiness()`. Wrap the call site in a QueryBoundary;
 * this component assumes `score` is present unless the band is
 * "insufficient", which it handles itself.
 */

const BAND_STYLES: Record<
  ReadinessBand,
  { ring: string; text: string; label: string }
> = {
  primed: { ring: "#4edea3", text: "text-secondary", label: "Primed" },
  balanced: { ring: "#c0c1ff", text: "text-primary", label: "Balanced" },
  compromised: { ring: "#ffb2b7", text: "text-error", label: "Compromised" },
  insufficient: { ring: "#5a5b6a", text: "text-outline", label: "No score yet" },
};

export function ReadinessCard({ data }: { data: ReadinessScore }) {
  // Defensive: this is the very first card on the dashboard. If the
  // endpoint ever returns an unexpected shape (or no score yet),
  // degrade to the "no score" state rather than crashing the whole
  // page on a missing `band`/`score`.
  if (!data || typeof data !== "object" || data.score == null) {
    return (
      <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
        <ReadinessHeader />
        <p className="text-on-surface-variant text-sm mt-2">
          {data?.summary || "Not enough data to compute readiness yet."}
        </p>
      </div>
    );
  }

  const style = BAND_STYLES[data.band] ?? BAND_STYLES.balanced;

  const drivers = [...data.components]
    .filter((c) => c.status === "good" || c.status === "poor")
    .sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0))
    .slice(0, 4);

  return (
    <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
      <ReadinessHeader date={data.date} />
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center mt-3">
        {/* Score dial */}
        <div className="flex items-center gap-4">
          <ScoreDial score={data.score} ring={style.ring} />
          <div>
            <div className={`text-lg font-bold font-headline ${style.text}`}>
              {style.label}
            </div>
            <p className="text-sm text-on-surface-variant max-w-xs">
              {data.summary}
            </p>
          </div>
        </div>

        {/* Trend + drivers */}
        <div className="space-y-3">
          {data.history.length > 1 && (
            <div className="h-12">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.history}>
                  <YAxis domain={[0, 100]} hide />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke={style.ring}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {drivers.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {drivers.map((c) => (
                <DriverChip key={c.metric} component={c} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadinessHeader({ date }: { date?: string | null }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-widest flex items-center gap-2">
        <span
          className="material-symbols-outlined text-primary text-base"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          bolt
        </span>
        Readiness
      </h2>
      {date && <span className="text-[11px] text-outline tabular-nums">{date}</span>}
    </div>
  );
}

function ScoreDial({ score, ring }: { score: number; ring: string }) {
  // Simple conic-gradient ring around the number.
  return (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center shrink-0"
      style={{
        background: `conic-gradient(${ring} ${score * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
      }}
      role="img"
      aria-label={`Readiness score ${score} of 100`}
    >
      <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center">
        <span className="text-2xl font-bold font-headline tabular-nums text-on-surface">
          {score}
        </span>
      </div>
    </div>
  );
}

function DriverChip({ component }: { component: ReadinessComponent }) {
  const good = component.status === "good";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
        good
          ? "bg-secondary/10 text-secondary"
          : "bg-error/10 text-error"
      }`}
    >
      <span className="material-symbols-outlined text-sm">
        {good ? "trending_up" : "trending_down"}
      </span>
      {component.label}
    </span>
  );
}
