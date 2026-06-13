import { useState } from "react";
import type { CorrelationsData, CorrelationPair } from "@health-dashboard/shared";
import { CorrelationBadge } from "./charts/CorrelationBadge";

// "Real enough to act on" gate. |r| ≥ 0.2 matches the "Weak" badge cutoff;
// n ≥ 12 sits just above the correlation engine's 10-day join floor so a
// barely-overlapping fluke can't headline. The grid below still shows
// everything — this panel is the verdict, not the full record.
const MIN_R = 0.2;
const MIN_N = 12;
const TOP_N = 6;

function strength(p: CorrelationPair): number {
  return Math.abs(p.correlation) * Math.sqrt(p.points.length);
}

function DirectionIcon({ positive }: { positive: boolean }) {
  return (
    <span
      className={`material-symbols-outlined text-base ${positive ? "text-secondary" : "text-error"}`}
      title={positive ? "move together" : "move opposite"}
      aria-label={positive ? "move together" : "move opposite"}
      style={{ fontVariationSettings: "'FILL' 1" }}
    >
      {positive ? "trending_up" : "trending_down"}
    </span>
  );
}

function MovingRow({ pair, max }: { pair: CorrelationPair; max: number }) {
  const positive = pair.correlation >= 0;
  const n = pair.points.length;
  const meter = max > 0 ? (strength(pair) / max) * 100 : 0;
  return (
    <li className="py-3 flex items-start gap-3">
      <DirectionIcon positive={positive} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm font-semibold text-on-surface">
            {pair.xLabel} <span className="text-outline">↔</span> {pair.yLabel}
            {pair.lagDays === 1 && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-outline font-bold">
                next day
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] uppercase font-bold tracking-widest text-outline tabular-nums">
              n = {n}
            </span>
            <CorrelationBadge r={pair.correlation} />
          </div>
        </div>
        <p className="text-xs text-on-surface-variant mt-0.5">{pair.insight}</p>
        {/* signal-strength meter (|r|·√n, normalized to the strongest row) */}
        <div className="mt-1.5 h-1 bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${positive ? "bg-secondary" : "bg-error"}`}
            style={{ width: `${meter}%` }}
          />
        </div>
      </div>
    </li>
  );
}

/**
 * Ranked verdict over the cross-metric correlations: only the
 * relationships strong + well-sampled enough to act on, ordered by
 * signal strength (|r|·√n, the same t-stat proxy the grid sorts by).
 * Renders above the full scatter grid so the page leads with "here's
 * what matters" instead of a wall of charts.
 */
export function WhatsMoving({ data }: { data: CorrelationsData }) {
  const [expanded, setExpanded] = useState(false);

  const ranked = data.pairs
    .filter((p) => Math.abs(p.correlation) >= MIN_R && p.points.length >= MIN_N)
    .sort((a, b) => strength(b) - strength(a));

  const visible = expanded ? ranked : ranked.slice(0, TOP_N);
  const max = ranked.length > 0 ? strength(ranked[0]) : 1;

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h2 className="text-lg font-headline font-semibold text-on-surface">
          What's Moving
        </h2>
        <span className="text-xs text-outline tabular-nums">
          {data.dataPoints} days
        </span>
      </div>
      <p className="text-xs text-on-surface-variant mb-2">
        Relationships strong and well-sampled enough to act on, ranked by
        signal strength. These are associations, not proof of cause.
      </p>

      {ranked.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">
          Nothing stands out strongly yet — no relationship clears the bar
          (|r| ≥ {MIN_R} over ≥ {MIN_N} days). Keep logging; weak hints are
          still visible in the full grid below.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-outline-variant/10">
            {visible.map((pair) => (
              <MovingRow
                key={`${pair.xMetric}-${pair.yMetric}-${pair.lagDays ?? 0}`}
                pair={pair}
                max={max}
              />
            ))}
          </ul>
          {ranked.length > TOP_N && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-primary hover:text-primary-container font-bold uppercase tracking-wider"
            >
              {expanded ? "Show fewer" : `Show ${ranked.length - TOP_N} more`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
