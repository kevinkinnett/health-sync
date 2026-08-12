import { useMemo } from "react";
import * as Plot from "@observablehq/plot";
import type { MetricSeries } from "@health-dashboard/shared";
import { PlotFigure } from "../charts/PlotFigure";
import { SERIES, STATUS, CHART_CHROME } from "../charts/chartPalette";

/**
 * The daily readings behind each verdict, as small multiples.
 *
 * The table gives a mean that moved and the effect plot gives its size.
 * Neither can say WHAT SHAPE the change was — a step on the day of the
 * change, a drift that began weeks earlier, or two outliers dragging an
 * average are all consistent with the same summary statistic, and they
 * support very different conclusions. Only the series separates them, and
 * a drift that predates the changepoint is visible here and nowhere else
 * in the report.
 *
 * Small multiples rather than one plot: these metrics are in minutes, bpm,
 * ms, percent and steps, so a shared y-scale would be meaningless. Each
 * panel keeps its own, and the shared x-axis carries the comparison.
 *
 * Built with Observable Plot, not Recharts, following the measurement that
 * Plot renders under jsdom (real path geometry, native ARIA) while
 * Recharts emits nothing there. A chart nobody can test is how this report
 * lost a whole series for seven weeks elsewhere in the app.
 */

/** Panels beyond this are diminishing returns and a lot of vertical space. */
const MAX_PANELS = 6;

export function MetricSeriesPanels({
  series,
  changepoint,
}: {
  series: MetricSeries[];
  changepoint: string;
}) {
  // Lead with the metrics that actually moved: `series` arrives in registry
  // order, which is a storage concern, not a reading order.
  const shown = useMemo(
    () =>
      [...series]
        .sort(
          (a, b) =>
            Math.abs(b.afterMean - b.beforeMean) / (Math.abs(b.beforeMean) || 1) -
            Math.abs(a.afterMean - a.beforeMean) / (Math.abs(a.beforeMean) || 1),
        )
        .slice(0, MAX_PANELS),
    [series],
  );

  if (shown.length === 0) return null;

  return (
    <div data-testid="metric-series-panels">
      <p className="text-[11px] uppercase tracking-wider text-outline mb-1">
        Day by day
      </p>
      <p className="text-[11px] text-outline mb-3">
        The readings behind the table. The dashed vertical is the change; the
        horizontal lines are each window's average. A step at the line is an
        effect; a slope that starts before it is not.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {shown.map((s) => (
          <SeriesPanel key={s.metric} series={s} changepoint={changepoint} />
        ))}
      </div>
    </div>
  );
}

function SeriesPanel({
  series: s,
  changepoint,
}: {
  series: MetricSeries;
  changepoint: string;
}) {
  // Colour the "after" level only when the report is willing to call the
  // change a result. A green line on a shift graded as noise makes a claim
  // the rest of the report deliberately withholds — resting HR moving
  // 67 → 66.8 is not an improvement, it is a flat line.
  const improved =
    s.betterDirection === "up"
      ? s.afterMean > s.beforeMean
      : s.afterMean < s.beforeMean;
  const afterStroke = !s.meaningful
    ? CHART_CHROME.inactive
    : improved
      ? STATUS.good
      : STATUS.critical;

  // PlotFigure re-plots on this identity, so it MUST be memoized or the
  // effect re-runs every render and the chart flickers.
  const options = useMemo<Plot.PlotOptions>(() => {
    const points = s.points.map((p) => ({ ...p, d: new Date(`${p.date}T00:00:00Z`) }));
    const cut = new Date(`${changepoint}T00:00:00Z`);
    return {
      height: 130,
      marginLeft: 42,
      marginRight: 26,  // the last tick label needs room or it clips
      marginTop: 8,
      marginBottom: 22,
      style: { background: "transparent", color: CHART_CHROME.axis, fontSize: "10px" },
      x: { type: "utc", label: null, ticks: 3, tickFormat: "%b %d" },
      y: { label: null, grid: true, nice: true },
      marks: [
        // Window averages first, so the series draws over them.
        Plot.ruleY([s.beforeMean], {
          stroke: CHART_CHROME.inactive,
          strokeDasharray: "4 3",
        }),
        Plot.ruleY([s.afterMean], {
          stroke: afterStroke,
          strokeDasharray: "4 3",
        }),
        // The changepoint.
        Plot.ruleX([cut], { stroke: CHART_CHROME.axis, strokeDasharray: "3 3" }),
        Plot.line(points, { x: "d", y: "value", stroke: SERIES[0], strokeWidth: 1.2 }),
        Plot.dot(points, { x: "d", y: "value", fill: SERIES[0], r: 1.4 }),
      ],
    };
  }, [s, changepoint, afterStroke]);

  return (
    <div className="bg-surface-container-high rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-on-surface truncate">
          {s.label}
        </span>
        <span className="text-[10px] text-outline tabular-nums shrink-0">
          {s.beforeMean} → {s.afterMean} {s.unit}
        </span>
      </div>
      {s.provenance && (
        <p className="text-[9px] text-outline mt-0.5 truncate" title={`${s.provenance.providerLabel}; ${s.provenance.regimes.join(", ")}`}>
          {s.provenance.deviceLabel} · {s.provenance.measurement}
        </p>
      )}
      <PlotFigure options={options} className="mt-1" />
    </div>
  );
}
