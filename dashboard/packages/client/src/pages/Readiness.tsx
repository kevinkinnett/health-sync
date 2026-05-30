import type {
  ReadinessBand,
  ReadinessComponent,
  ReadinessScore,
} from "@health-dashboard/shared";
import { useReadiness } from "../api/queries";
import {
  MetricLineChart,
  type MetricPoint,
} from "../components/charts/MetricLineChart";

/**
 * Readiness detail screen — the "more information" view behind the
 * dashboard's readiness card. Shows the full per-signal breakdown
 * (every metric, not just the top drivers), each signal's Fitbit-vs-
 * Eight-Sleep fusion, the trend, and how the score is computed.
 *
 * All from `useReadiness()` — no extra endpoint.
 */

const BAND: Record<ReadinessBand, { ring: string; text: string; label: string; blurb: string }> = {
  primed: { ring: "#4edea3", text: "text-secondary", label: "Primed", blurb: "Clearly above your baseline — a good day to push." },
  balanced: { ring: "#c0c1ff", text: "text-primary", label: "Balanced", blurb: "Around your baseline — train as planned." },
  compromised: { ring: "#ffb2b7", text: "text-error", label: "Compromised", blurb: "Below your baseline — favour recovery." },
  insufficient: { ring: "#5a5b6a", text: "text-outline", label: "No score yet", blurb: "Not enough baseline history." },
};

export function Readiness() {
  const q = useReadiness();

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
              {style.blurb} Scored {data.date} from a {data.baselineDays}-day personal baseline.
            </p>
          </div>
        </div>
      </div>

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

      {/* Per-signal breakdown */}
      <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
        <h3 className="font-headline font-semibold text-on-surface mb-1">Signal breakdown</h3>
        <p className="text-xs text-outline mb-4">
          Each signal is scored as a deviation from your own baseline (z), then weighted.
          Signals measured by two devices show each sensor's contribution; ⚑ marks where they disagreed.
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
          <li>Signals from two devices (Fitbit + Eight Sleep) are <strong>fused</strong> — each z-scored against its own baseline, then blended, so neither sensor's scale dominates.</li>
          <li>Weighted, renormalised over whatever's available, and mapped to 0–100. Bands: ≥66 primed · 40–65 balanced · &lt;40 compromised.</li>
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

function ComponentRow({ c }: { c: ReadinessComponent }) {
  const z = c.z ?? 0;
  // Center bar: 0 in the middle, fill right (good) / left (poor), |z| up to 3.
  const pct = Math.min(Math.abs(z) / 3, 1) * 50;
  const good = z >= 0;
  return (
    <div className="py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[c.status]}`} />
          <span className="text-sm font-semibold text-on-surface">{c.label}</span>
          {c.disagreement && (
            <span title="Sensors disagreed on this signal" aria-label="sensors disagreed">⚑</span>
          )}
        </div>
        <span className="text-[10px] text-outline uppercase tracking-widest">{c.weightPct}% weight</span>
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
        <div className="text-[11px] text-outline mt-1">
          {c.sources.map((s) => `${s.label} ${s.z >= 0 ? "+" : ""}${s.z}`).join(" · ")}
        </div>
      )}
    </div>
  );
}
