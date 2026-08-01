import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { ActivityDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";
import { movingAverage } from "../../utils/movingAverage";
import { METRIC_COLOR } from "./chartPalette";
import { formatWithUnit } from "./tooltipFormat";
import type { ChartAnnotation } from "./annotations";
import { annotationMarkers } from "./annotationMarkers";

interface Props {
  data: ActivityDay[];
  /** Vertical markers for dated changes (see `annotations.ts`). */
  annotations?: ChartAnnotation[];
}

/**
 * Steps and active minutes, as two stacked panels sharing one date axis.
 *
 * It used to be a single plot with TWO y-scales — steps 0-18,000 on the left,
 * minutes 0-160 on the right. That is the most misleading thing a time-series
 * chart can do: where the two lines cross, and how far apart they sit, is
 * decided by the arbitrary ratio between the scales, so the reader sees a
 * relationship the data never claimed. It also painted both series with
 * METRIC_COLOR.steps, so the two measures were the same blue, while the
 * 7-day average of steps wore METRIC_COLOR.activeMinutes — the one orange on
 * the chart named after the series it did NOT describe.
 *
 * Small multiples fix all of it: each measure keeps its own honest scale, one
 * hue per entity, and the shared x-axis still supports the only comparison
 * that was ever valid — did these move together on the same day?
 *
 * The 7-day average keeps the STEPS hue rather than taking a slot of its own.
 * It is the same entity, smoothed, and colour follows the entity; weight and
 * dash carry the difference instead.
 */
export function ActivityChart({ data, annotations = [] }: Props) {
  const ct = useChartTheme();
  const ma7 = movingAverage(data, (d) => d.steps, 7);
  const chartData = data.map((d, i) => ({
    date: d.date,
    steps: d.steps,
    activeMinutes: (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
    stepsMA: ma7[i],
  }));

  // Both panels must use identical left/right margins and y-axis widths, or
  // the two plot areas drift apart and the shared date axis stops lining up.
  const MARGIN = { top: 4, right: 12, left: 4, bottom: 0 };
  const Y_WIDTH = 52;

  // Labels off, uniquely among the charts: the markers are drawn on BOTH
  // panels, so a caption would appear twice for the same change. The key
  // line under the chart names them once instead.
  const markers = annotationMarkers(annotations, { labels: false });

  const grid = <CartesianGrid stroke={ct.grid} vertical={false} />;

  // Full ISO dates collide well before a 90-day window — ten of them already
  // overlap at this width. The year is constant across the axis and is in the
  // tooltip, so the ticks drop it and Recharts thins them by pixel gap.
  const dateTick = (v: string) => v.slice(5);

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface">
        Activity
      </h3>
      <p className="text-xs text-on-surface-variant mt-1 mb-4 max-w-prose">
        Daily steps and hard-effort minutes, on separate scales. Active minutes
        counts moderate and vigorous time only, so a strength session that
        produces few steps still shows up here.
      </p>

      <PanelLabel name="Steps" unit="per day" />
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={MARGIN} syncId="activity">
            {grid}
            {/* The date axis lives on the lower panel only; repeating it here
                would duplicate every label. `hide` (not height={0}, which
                degenerates the layout and renders the whole panel blank)
                keeps the scale while dropping the band. Horizontal alignment
                between panels comes from the equal margins and the fixed
                y-axis width, not from this axis. */}
            <XAxis dataKey="date" hide />
            <YAxis
              tick={ct.tick}
              tickLine={false}
              axisLine={false}
              width={Y_WIDTH}
            />
            <Tooltip
              contentStyle={ct.tooltip.contentStyle}
              labelStyle={ct.tooltip.labelStyle}
              itemStyle={ct.tooltip.itemStyle}
              formatter={formatWithUnit("steps")}
            />
            <Legend
              verticalAlign="top"
              align="left"
              height={22}
              iconSize={9}
              /* Indent past the y-axis gutter, or the first swatch sits on
                 top of the topmost tick label. */
              wrapperStyle={{ paddingLeft: Y_WIDTH }}
              /* Text wears an ink token, never the series colour — the swatch
                 beside it already carries identity. Recharts otherwise paints
                 each label in its series hue, which reads as decoration. */
              formatter={(value: string) => (
                <span style={{ color: ct.tick.fill, fontSize: 11 }}>{value}</span>
              )}
            />
            {markers}
            <Area
              type="monotone"
              dataKey="steps"
              stroke={METRIC_COLOR.steps}
              strokeWidth={1}
              strokeOpacity={0.55}
              fill={METRIC_COLOR.steps}
              fillOpacity={0.12}
              name="Steps"
            />
            <Line
              type="monotone"
              dataKey="stepsMA"
              stroke={METRIC_COLOR.steps}
              strokeWidth={2}
              dot={false}
              connectNulls
              name="Steps, 7-day avg"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <PanelLabel name="Active minutes" unit="moderate + vigorous, per day" />
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={MARGIN} syncId="activity">
            {grid}
            <XAxis
              dataKey="date"
              tick={ct.tick}
              tickLine={false}
              tickFormatter={dateTick}
              minTickGap={28}
            />
            <YAxis
              tick={ct.tick}
              tickLine={false}
              axisLine={false}
              width={Y_WIDTH}
            />
            <Tooltip
              contentStyle={ct.tooltip.contentStyle}
              labelStyle={ct.tooltip.labelStyle}
              itemStyle={ct.tooltip.itemStyle}
              formatter={formatWithUnit("min")}
            />
            {markers}
            {/* Single series — the axis title names it, so no legend box. */}
            <Area
              type="monotone"
              dataKey="activeMinutes"
              stroke={METRIC_COLOR.activeMinutes}
              strokeWidth={1.5}
              fill={METRIC_COLOR.activeMinutes}
              fillOpacity={0.18}
              name="Active minutes"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {annotations.length > 0 && (
        <p
          className="text-[10px] text-outline mt-2"
          data-testid="activity-annotation-key"
        >
          Dashed verticals mark {annotations.map((a) => a.label).join(", ")}.
        </p>
      )}
    </div>
  );
}

/**
 * Names a panel and its unit in real HTML above the plot.
 *
 * Deliberately not a Recharts `YAxis label` — a rotated SVG title is harder
 * to read, invisible to a screen reader in any useful order, and (on the
 * upper panel here) silently fails to lay out at all next to a Legend.
 */
function PanelLabel({ name, unit }: { name: string; unit: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-1" data-testid={`panel-${name}`}>
      <span className="text-xs font-medium text-on-surface">{name}</span>
      <span className="text-[10px] text-outline">{unit}</span>
    </div>
  );
}
