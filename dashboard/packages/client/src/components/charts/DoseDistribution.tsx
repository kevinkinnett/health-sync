import { useMemo } from "react";
import * as Plot from "@observablehq/plot";
import type { DoseResponseSummary } from "@health-dashboard/shared";
import { PlotFigure, PLOT_STYLE, METRIC_COLOR } from "./PlotFigure";

function levelLabel(dose: number, unit: string): string {
  if (dose === 0) return "Not taken";
  // Mixed-unit items fall back to per-day counts server-side ("(count)");
  // phrase those as a frequency, matching the dose-level table.
  if (unit === "count") return `${dose}× per day`;
  return `${dose} ${unit}`;
}

function MetricBox({
  metric,
  rows,
  color,
}: {
  metric: { metric: string; metricLabel: string };
  rows: { level: string; value: number }[];
  color: string;
}) {
  const options = useMemo<Plot.PlotOptions>(
    () => ({
      height: 200,
      marginLeft: 48,
      marginBottom: 34,
      style: PLOT_STYLE,
      x: { label: null, type: "band", tickSize: 0 },
      y: { label: null, grid: true, nice: true },
      marks: [
        Plot.boxY(rows, {
          x: "level",
          y: "value",
          stroke: color,
          fill: color,
          fillOpacity: 0.12,
          strokeWidth: 1.5,
        }),
      ],
    }),
    [rows, color],
  );

  return (
    <div className="bg-surface-container-low rounded-xl p-3">
      <h4 className="text-xs font-semibold text-on-surface mb-1">
        {metric.metricLabel}
      </h4>
      <PlotFigure options={options} className="overflow-x-auto" />
    </div>
  );
}

/**
 * Per-metric box-plot distributions across dose levels — the "is the
 * difference real or noise?" companion to the dose-level means table.
 * Heavy box overlap between levels = likely noise; clear separation = a
 * real shift. Only metrics with data at ≥2 levels are shown.
 */
export function DoseDistribution({ data }: { data: DoseResponseSummary }) {
  const unit = data.xLabel.match(/\((.+)\)/)?.[1] ?? "";

  const panels = data.metrics
    .map((m) => {
      const withData = m.byLevel.filter((b) => b.values.length > 0);
      if (withData.length < 2) return null;
      const rows = withData.flatMap((b) =>
        b.values.map((value) => ({ level: levelLabel(b.dose, unit), value })),
      );
      return { metric: m, rows };
    })
    .filter((p): p is { metric: DoseResponseSummary["metrics"][number]; rows: { level: string; value: number }[] } => p != null);

  if (panels.length === 0) return null;

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-1">
        Dose Distributions
      </h3>
      <p className="text-xs text-on-surface-variant mb-4">
        The spread of each metric at every dose level. Boxes that overlap
        heavily mean the difference is likely noise; clearly separated boxes
        suggest a real shift.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {panels.map((p) => (
          <MetricBox
            key={p.metric.metric}
            metric={p.metric}
            rows={p.rows}
            color={METRIC_COLOR[p.metric.metric] ?? "#8083ff"}
          />
        ))}
      </div>
    </div>
  );
}
