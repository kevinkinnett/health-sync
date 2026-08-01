import type { MetricEffect } from "@health-dashboard/shared";
import { STATUS, CHART_CHROME } from "../charts/chartPalette";

/**
 * Every metric's effect on one axis, so "which of these actually moved" is
 * a glance instead of a calculation.
 *
 * The table beside this is honest but slow to read: the units are all
 * different, so comparing a 46-minute sleep change against a 1.8 bpm
 * resting-HR change means standardising them in your head. That is exactly
 * what Cohen's d already did, and this draws it.
 *
 * The ±0.3 threshold is drawn as a band rather than left implicit. It is
 * the engine's own rule for "meaningful", and a reader who can see where
 * the bar sits relative to it can disagree with the verdict — which they
 * cannot do when the rule is buried in a boolean.
 *
 * Plain SVG, not a charting library: Recharts renders nothing under jsdom,
 * and a chart whose whole job is honesty should not be the one component
 * no test can see.
 */

/** The engine calls an effect meaningful at |d| >= this. */
const MEANINGFUL_D = 0.3;

/** Axis half-width. Clamped up so a single large effect doesn't flatten the rest. */
const MIN_DOMAIN = 1;

export function effectDomain(metrics: MetricEffect[]): number {
  const largest = Math.max(
    0,
    ...metrics.map((m) => Math.abs(m.effectSize ?? 0)),
  );
  return Math.max(MIN_DOMAIN, Math.ceil(largest * 2) / 2);
}

export function EffectSizePlot({ metrics }: { metrics: MetricEffect[] }) {
  const plotted = metrics.filter((m) => m.effectSize != null);
  if (plotted.length === 0) return null;

  const domain = effectDomain(plotted);
  // Percent of width for a given d, with 0 at the centre.
  const xPct = (d: number) => ((d + domain) / (2 * domain)) * 100;

  return (
    <div data-testid="effect-size-plot">
      <p className="text-[11px] uppercase tracking-wider text-outline mb-1">
        Effect size
      </p>
      <p className="text-[11px] text-outline mb-3">
        Each change measured against that metric's own variability, so
        different units sit on one scale. Shaded band = too small for this
        report to call meaningful.
      </p>

      <div className="space-y-1.5">
        {plotted.map((m) => (
          <EffectRow key={m.metric} effect={m} xPct={xPct} />
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-outline tabular-nums mt-2">
        <span>−{domain} worse</span>
        <span>0</span>
        <span>+{domain} better</span>
      </div>
    </div>
  );
}

function EffectRow({
  effect: m,
  xPct,
}: {
  effect: MetricEffect;
  xPct: (d: number) => number;
}) {
  const d = m.effectSize as number;

  // Plot in "better is right" space rather than raw sign, so a falling
  // resting HR and a rising sleep score both point the same way. Without
  // this the axis would mean the opposite thing on different rows.
  const oriented = m.betterDirection === "down" ? -d : d;

  const zero = xPct(0);
  const value = xPct(oriented);
  const left = Math.min(zero, value);
  const width = Math.abs(value - zero);

  const color = !m.meaningful
    ? CHART_CHROME.inactive
    : m.improved
      ? STATUS.good
      : STATUS.critical;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-on-surface-variant w-28 shrink-0 truncate">
        {m.label}
      </span>

      <span className="relative flex-1 h-4">
        {/* The "not meaningful" band, drawn under everything. */}
        <span
          className="absolute inset-y-0 bg-on-surface/5"
          style={{
            left: `${xPct(-MEANINGFUL_D)}%`,
            width: `${xPct(MEANINGFUL_D) - xPct(-MEANINGFUL_D)}%`,
          }}
        />
        {/* Zero line. */}
        <span
          className="absolute inset-y-0 w-px"
          style={{ left: `${zero}%`, backgroundColor: CHART_CHROME.axis }}
        />
        <span
          className="absolute top-1 bottom-1 rounded-sm"
          style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
        />
      </span>

      {/* Never colour alone: the number and its direction are spelled out. */}
      <span
        className="text-[11px] tabular-nums text-on-surface-variant w-20 shrink-0 text-right"
        data-testid={`effect-verdict-${m.metric}`}
      >
        {d > 0 ? "+" : ""}
        {d}
        <span className="text-outline"> {m.meaningful ? (m.improved ? "better" : "worse") : "—"}</span>
      </span>
    </div>
  );
}
