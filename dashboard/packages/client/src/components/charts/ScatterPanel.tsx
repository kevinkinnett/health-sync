import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useChartTheme } from "../../stores/themeStore";
import { CorrelationBadge } from "./CorrelationBadge";

export interface ScatterPanelPoint {
  x: number;
  y: number;
  date: string;
}

export interface ScatterPanelProps {
  /** Heading shown at the top of the card, e.g. "Steps vs Sleep (min)". */
  title: string;
  /** One-liner appearing under the title — server-provided "insight". */
  insight: string;
  /** Pearson r used to render the {@link CorrelationBadge}. */
  correlation: number;
  /** Optional sample-size pill ("n = 23 days") rendered next to the badge. */
  n?: number;
  /** Sorted by date so tooltip ordering is stable. */
  points: ScatterPanelPoint[];
  /** Axis labels — used for both the axis ticks and the chart legend. */
  xAxisLabel: string;
  yAxisLabel: string;
}

/**
 * Reusable scatter card. Lives under `components/charts/` so both the
 * cross-metric correlations grid and the supplement/medication
 * correlation grids can render the same visual idiom without
 * duplicating recharts wiring.
 */
export function ScatterPanel({
  title,
  insight,
  correlation,
  n,
  points,
  xAxisLabel,
  yAxisLabel,
}: ScatterPanelProps) {
  const ct = useChartTheme();

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <div className="flex items-center justify-between mb-1 gap-2">
        <h3 className="text-sm font-headline font-semibold text-on-surface">
          {title}
        </h3>
        <div className="flex items-center gap-1.5">
          {n != null && (
            <span className="text-[10px] uppercase font-bold tracking-widest text-outline tabular-nums">
              n = {n}
            </span>
          )}
          <CorrelationBadge r={correlation} />
        </div>
      </div>
      <p className="text-xs text-on-surface-variant mb-3">{insight}</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 5, bottom: 20, left: 5 }}>
            <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={xAxisLabel}
              tick={ct.tick}
              label={{
                value: xAxisLabel,
                position: "bottom",
                offset: 5,
                ...ct.tick,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yAxisLabel}
              tick={ct.tick}
              width={45}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={ct.tooltip.contentStyle}
              labelStyle={ct.tooltip.labelStyle}
              itemStyle={ct.tooltip.itemStyle}
              formatter={(value: number) => [value.toLocaleString()]}
              labelFormatter={() => ""}
            />
            <Scatter data={points} fill="#8083ff" fillOpacity={0.6} r={3} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
