import { useMemo } from "react";
import * as Plot from "@observablehq/plot";
import type { LagProfile } from "@health-dashboard/shared";
import { PlotFigure } from "./PlotFigure";
import { PLOT_STYLE, METRIC_COLOR } from "./plotTheme";

interface Row {
  lag: number;
  r: number;
  metric: string;
  label: string;
}

/**
 * Lag-correlation curve: how each metric's correlation with the daily
 * dose changes as you look 0..maxLag days *after* the dose. A peak/trough
 * away from lag 0 is a delayed effect; lines hugging 0 mean no relationship
 * at any delay. Replaces guessing with the same-day/+1/+2 toggle.
 */
export function LagCurve({ data }: { data: LagProfile }) {
  const rows: Row[] = useMemo(
    () =>
      data.metrics.flatMap((m) =>
        m.points
          .filter((p): p is { lag: number; r: number; n: number } => p.r != null)
          .map((p) => ({ lag: p.lag, r: p.r, metric: m.metric, label: m.metricLabel })),
      ),
    [data],
  );

  const options = useMemo<Plot.PlotOptions>(() => {
    const labels = [...new Set(rows.map((r) => r.label))];
    const colorRange = labels.map((label) => {
      const metric = rows.find((r) => r.label === label)!.metric;
      return METRIC_COLOR[metric] ?? "#8083ff";
    });
    return {
      height: 280,
      marginLeft: 44,
      marginBottom: 36,
      style: PLOT_STYLE,
      x: {
        label: "Days after dose →",
        ticks: Array.from({ length: data.maxLag + 1 }, (_, i) => i),
        tickFormat: (d: number) => (d === 0 ? "same day" : `+${d}`),
      },
      y: { label: "correlation (r)", domain: [-1, 1], grid: true },
      color: { domain: labels, range: colorRange, legend: true },
      marks: [
        // "Noise" band: |r| < 0.2 is too weak to act on.
        Plot.rect([{}], {
          y1: -0.2,
          y2: 0.2,
          fill: "#222a3d",
          fillOpacity: 0.35,
        }),
        Plot.ruleY([0], { stroke: "#464554" }),
        Plot.line(rows, {
          x: "lag",
          y: "r",
          z: "label",
          stroke: "label",
          strokeWidth: 1.5,
          curve: "monotone-x",
        }),
        Plot.dot(rows, { x: "lag", y: "r", fill: "label", r: 2.5 }),
      ],
    };
  }, [rows, data.maxLag]);

  if (rows.length === 0) {
    return (
      <div className="bg-surface-container rounded-xl p-6 text-center text-sm text-on-surface-variant">
        Not enough varying-dose history to compute a lag profile yet.
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-1">
        Effect Timing
      </h3>
      <p className="text-xs text-on-surface-variant mb-3">
        Correlation between dose and each metric at increasing day-lags. A dip
        or spike <span className="text-on-surface">away</span> from "same day"
        points to a delayed effect; lines inside the shaded band are too weak to
        read into.
      </p>
      <PlotFigure options={options} className="overflow-x-auto" />
    </div>
  );
}
