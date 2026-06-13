import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

/**
 * Thin React wrapper around Observable Plot. Plot renders to a detached
 * DOM node (it's imperative), so we append it on mount and tear it down
 * on change. `options` MUST be memoized by the caller (useMemo) — a fresh
 * object every render would re-plot on every render.
 *
 * Used for the statistical charts recharts is awkward at: box-plot
 * distributions and the lag-correlation curve.
 */
export function PlotFigure({
  options,
  className,
}: {
  options: Plot.PlotOptions;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = Plot.plot(options);
    el.append(chart);
    return () => chart.remove();
  }, [options]);
  return <div ref={ref} className={className} />;
}

/** Shared dark-theme defaults so Plot figures match the recharts ones. */
export const PLOT_STYLE = {
  background: "transparent",
  color: "#908fa0",
  fontFamily: "Manrope, system-ui, sans-serif",
  fontSize: "11px",
  overflow: "visible",
} as const;

/** Stable per-metric colors shared across the Plot figures. */
export const METRIC_COLOR: Record<string, string> = {
  steps: "#8083ff",
  sleepMin: "#c0c1ff",
  deepMin: "#4edea3",
  restingHr: "#ffb2b7",
  dailyRmssd: "#ffd479",
};
