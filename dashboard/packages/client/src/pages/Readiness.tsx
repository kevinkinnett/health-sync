import { Link } from "react-router-dom";
import type {
  ReadinessBand,
  ReadinessComponent,
  ReadinessMetric,
  ReadinessScore,
} from "@health-dashboard/shared";
import { useReadiness } from "../api/queries";
import {
  MetricLineChart,
  type MetricPoint,
} from "../components/charts/MetricLineChart";
import { ReadinessWaterfall } from "../components/charts/ReadinessWaterfall";
import { READINESS_BAND_COLOR } from "../components/charts/chartPalette";
import { readinessSourceLabel } from "../lib/readinessSource";

/**
 * Readiness detail screen — the "more information" view behind the
 * dashboard's readiness card. Shows the full per-signal breakdown
 * (every metric, not just the top drivers), each physical sensor's
 * contribution and ingestion provenance, the trend, and the methodology.
 *
 * All from `useReadiness()` — no extra endpoint.
 */

const BAND: Record<ReadinessBand, { ring: string; text: string; label: string; blurb: string }> = {
  primed: { ring: READINESS_BAND_COLOR.primed, text: "text-secondary", label: "Primed", blurb: "Clearly above your baseline — a good day to push." },
  balanced: { ring: READINESS_BAND_COLOR.balanced, text: "text-primary", label: "Balanced", blurb: "Around your baseline — train as planned." },
  compromised: { ring: READINESS_BAND_COLOR.compromised, text: "text-error", label: "Compromised", blurb: "Below your baseline — favour recovery." },
  insufficient: { ring: READINESS_BAND_COLOR.insufficient, text: "text-outline", label: "No score yet", blurb: "Not enough baseline history." },
};

export function Readiness() {
  // Longer trend than the dashboard card's 14-day glance — this is the
  // analysis view. 45 stays within the 90-day input window (+30 baseline).
  const q = useReadiness(45);

  if (q.isLoading) {
    return <p className="text-sm text-outline">Loading readiness…</p>;
  }
  const data = q.data;
  if (!data || data.score == null) {
    return (
      <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
        <p className="text-on-surface-variant text-sm">
          {data?.summary || "Not enough data to compute readiness yet — keep syncing."}
        </p>
      </div>
    );
  }
  return <ReadinessDetail data={data} />;
}

function ReadinessDetail({ data }: { data: ReadinessScore }) {
  const style = BAND[data.band] ?? BAND.balanced;
  const present = data.components.filter((c) => c.z != null);
  const unavailable = data.components.filter((c) => c.z == null);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <ScoreDial score={data.score!} ring={style.ring} />
          <div className="flex-1">
            <div className={`text-2xl font-bold font-headline ${style.text}`}>{style.label}</div>
            <p className="text-on-surface-variant mt-1">{data.summary}</p>
            <p className="text-xs text-outline mt-2">
              {style.blurb} Night ending {data.date} in {data.timezone}, from a {data.baselineDays}-night personal baseline.
            </p>
            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
              <span className={`rounded-full px-2.5 py-1 font-semibold ${
                data.confidence === "high" ? "bg-secondary/10 text-secondary" :
                data.confidence === "moderate" ? "bg-primary/10 text-primary" : "bg-error/10 text-error"
              }`}>{data.confidence} confidence</span>
              <span className="rounded-full px-2.5 py-1 bg-surface-container-high text-on-surface-variant">
                {data.coveragePct}% signal coverage
              </span>
              {data.provisional && (
                <span className="rounded-full px-2.5 py-1 bg-primary/10 text-primary">provisional</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {data.caveats.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h3 className="text-sm font-semibold text-on-surface">How to read this score</h3>
          <ul className="mt-2 space-y-1 text-xs text-on-surface-variant list-disc pl-4">
            {data.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
          </ul>
        </div>
      )}

      {/* Trend */}
      {data.history.length > 1 && (
        <MetricLineChart
          title="Readiness Trend"
          description="Daily readiness over the recent window. 50 = exactly at your baseline; higher = better recovered."
          unit=""
          color={style.ring}
          digits={0}
          domain={[0, 100]}
          data={data.history.map((p): MetricPoint => ({ date: p.date, value: p.score }))}
        />
      )}

      {/* What's driving the score — the actionable lever view */}
      <ReadinessWaterfall data={data} />

      {/* Per-signal breakdown */}
      <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
        <h3 className="font-headline font-semibold text-on-surface mb-1">Signal breakdown</h3>
        <p className="text-xs text-outline mb-4">
          Each signal is scored as a deviation from your own baseline (z), then weighted.
          Each source keeps its own raw reading, definition, baseline, and algorithm regime. ⚑ marks a trend disagreement—not automatically a faulty sensor.
        </p>
        <div className="divide-y divide-outline-variant/10">
          {present.map((c) => <ComponentRow key={c.metric} c={c} />)}
        </div>
        {unavailable.length > 0 && (
          <p className="text-[11px] text-outline mt-4">
            Not scored today (no data in window): {unavailable.map((c) => c.label).join(", ")}.
          </p>
        )}
      </div>

      {/* Methodology */}
      <div className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
        <h3 className="font-headline font-semibold text-on-surface mb-2 text-sm">How readiness is computed</h3>
        <ul className="text-xs text-on-surface-variant space-y-1.5 list-disc pl-4">
          <li>Every signal is compared to <strong>your own</strong> trailing {data.baselineDays}-day baseline, not population norms — 50 means "exactly typical for you".</li>
          <li>Each deviation is signed so <strong>positive always means better-recovered</strong> (HRV up = good; resting HR up = bad).</li>
          <li>Signals from two devices (Fitbit device via Google Health + Eight Sleep) are <strong>fused</strong> — each z-scored against its own baseline, then blended, so neither sensor's scale dominates.</li>
          <li>Raw readings are averaged only when their definitions are comparable. Daily resting HR, non-REM HR, and average sleeping HR remain visibly distinct.</li>
          <li>Baselines reset when a provider or measurement algorithm changes. Weights shown above are the actual normalized shares for this night.</li>
          <li>This is a versioned personal wellness estimate ({data.methodVersion}), not a diagnosis. Bands: ≥66 primed · 40–65 balanced · &lt;40 compromised.</li>
        </ul>
      </div>
    </div>
  );
}

function ScoreDial({ score, ring }: { score: number; ring: string }) {
  return (
    <div
      className="w-24 h-24 rounded-full flex items-center justify-center shrink-0"
      style={{ background: `conic-gradient(${ring} ${score * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}
      role="img"
      aria-label={`Readiness score ${score} of 100`}
    >
      <div className="w-[84px] h-[84px] rounded-full bg-surface-container flex items-center justify-center">
        <span className="text-3xl font-bold font-headline tabular-nums text-on-surface">{score}</span>
      </div>
    </div>
  );
}

const STATUS_DOT: Record<ReadinessComponent["status"], string> = {
  good: "bg-secondary",
  poor: "bg-error",
  neutral: "bg-outline",
  unavailable: "bg-outline/40",
};

/** Where each signal's full history lives — tap a row to drill in. */
const METRIC_ROUTE: Partial<Record<ReadinessMetric, string>> = {
  hrv: "/analytics/hrv",
  rhr: "/analytics/heart-rate",
  sleep: "/analytics/sleep",
  breathing: "/analytics/vitals",
  spo2: "/analytics/vitals",
  skinTemp: "/analytics/vitals",
  restlessness: "/analytics/eight-sleep",
};

function ComponentRow({ c }: { c: ReadinessComponent }) {
  const z = c.z ?? 0;
  // Center bar: 0 in the middle, fill right (good) / left (poor), |z| up to 3.
  const pct = Math.min(Math.abs(z) / 3, 1) * 50;
  const good = z >= 0;
  const route = METRIC_ROUTE[c.metric];

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[c.status]}`} />
          <span className="text-sm font-semibold text-on-surface">{c.label}</span>
          {c.disagreement && (
            <span title="Sensors disagreed on this signal" aria-label="sensors disagreed">⚑</span>
          )}
        </div>
        <span className="text-[10px] text-outline uppercase tracking-widest flex items-center gap-1">
          {c.weightPct}% effective weight
          {route && (
            <span className="material-symbols-outlined text-sm text-outline group-hover:text-primary transition-colors">
              chevron_right
            </span>
          )}
        </span>
      </div>

      {/* z bar */}
      <div className="relative h-2 my-2 bg-surface-container-highest rounded-full">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-outline-variant/40" />
        <div
          className={`absolute top-0 bottom-0 rounded-full ${good ? "bg-secondary" : "bg-error"}`}
          style={good ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-on-surface-variant tabular-nums">
          {c.value != null ? c.value.toLocaleString() : "—"}
          {c.baseline != null && <span className="text-outline"> · baseline {c.baseline.toLocaleString()}</span>}
        </span>
        <span className={`tabular-nums font-medium ${good ? "text-secondary" : "text-error"}`}>
          z {z >= 0 ? "+" : ""}{z}
        </span>
      </div>

      {c.sources && c.sources.length > 0 && (
        <div className="grid gap-1.5 mt-2 sm:grid-cols-2">
          {c.sources.map((source) => (
            <div key={source.provenance.device} className="rounded-lg bg-surface-container-high px-2.5 py-2 text-[11px]">
              <div className="flex justify-between gap-2 text-on-surface-variant">
                <span className="font-semibold">{readinessSourceLabel(source)}</span>
                <span className="tabular-nums">z {source.z >= 0 ? "+" : ""}{source.z}</span>
              </div>
              <div className="mt-0.5 text-outline tabular-nums">
                {source.value.toLocaleString()} · baseline {source.baseline.toLocaleString()}
              </div>
              <div className="text-outline">{source.measurement}</div>
            </div>
          ))}
        </div>
      )}
      {c.disagreementExplanation && (
        <p className={`mt-2 text-[11px] ${c.disagreement ? "text-primary" : "text-outline"}`}>
          {c.disagreementExplanation}
        </p>
      )}
    </>
  );

  return route ? (
    <Link
      to={route}
      aria-label={`${c.label} — view full history`}
      className="group block py-3 px-3 -mx-3 rounded-lg hover:bg-surface-container-high transition-colors"
    >
      {inner}
    </Link>
  ) : (
    <div className="py-3">{inner}</div>
  );
}
