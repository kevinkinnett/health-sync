import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { useChartTheme } from "../../stores/themeStore";
import { formatWithUnit } from "./tooltipFormat";
import type { ChartAnnotation } from "./annotations";
import { DEFAULT_SERIES } from "./chartPalette";

export interface MetricPoint {
  date: string;
  value: number | null;
}

interface Props {
  title: string;
  description?: string;
  data: MetricPoint[];
  unit: string;
  /** Series colour. */
  color?: string;
  /** Draw a dashed reference line at 0 — for deviation metrics. */
  referenceZero?: boolean;
  /** Overlay a 7-day moving average. */
  movingAverage?: boolean;
  /** Recharts Y domain; defaults to a small auto pad. */
  domain?: [number | string, number | string];
  /** Decimal places for the tooltip/axis. */
  digits?: number;
  /**
   * Vertical markers for dated changes (see `annotations.ts`).
   * Passed in as data so this component stays presentational.
   */
  annotations?: ChartAnnotation[];
}

/**
 * Generic single-series daily line chart with optional 7-day moving
 * average and zero reference line. Used by the Vitals screen for the
 * three numeric overnight metrics (SpO2 average, breathing rate, skin-
 * temp deviation), which all share the same shape: one value per day.
 *
 * Kept deliberately generic rather than one chart component per metric
 * — they differ only in label/unit/colour and the two flags.
 */
export function MetricLineChart({
  title,
  description,
  data,
  unit,
  color = DEFAULT_SERIES,
  referenceZero = false,
  movingAverage = false,
  domain = ["dataMin - 1", "dataMax + 1"],
  digits = 1,
  annotations = [],
}: Props) {
  const ct = useChartTheme();
  const round = (v: number) => Math.round(v * 10 ** digits) / 10 ** digits;

  const chartData = data.map((d, i) => {
    let ma: number | null = null;
    if (movingAverage) {
      const window = data
        .slice(Math.max(0, i - 6), i + 1)
        .map((w) => w.value)
        .filter((v): v is number => v != null);
      ma =
        window.length > 0
          ? round(window.reduce((a, b) => a + b, 0) / window.length)
          : null;
    }
    return {
      date: d.date,
      value: d.value != null ? round(d.value) : null,
      ...(movingAverage ? { ma7d: ma } : {}),
    };
  });

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-1">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-outline mb-4">{description}</p>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis
            domain={domain}
            tick={ct.tick}
            width={48}
            label={{
              value: unit,
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 11, fill: ct.tick.fill },
            }}
          />
          <Tooltip
            contentStyle={ct.tooltip.contentStyle}
            labelStyle={{ ...ct.tooltip.labelStyle, fontWeight: 600 }}
            itemStyle={ct.tooltip.itemStyle}
            formatter={formatWithUnit(unit)}
          />
          {(movingAverage || referenceZero) && <Legend />}
          {referenceZero && (
            <ReferenceLine y={0} stroke={ct.grid} strokeDasharray="4 4" />
          )}
          {annotations.map((a) => (
            <ReferenceLine
              key={`${a.date}-${a.label}`}
              x={a.date}
              stroke={a.color}
              strokeDasharray="3 3"
              strokeWidth={1}
              /*
               * A render function, not `label="text"` or a <Label> child.
               * Both of those typecheck and silently draw nothing here: a
               * VERTICAL reference line's viewBox has zero width, and
               * Recharts' position keywords ("insideTopLeft", …) resolve
               * against that box, so the caption lands nowhere. Placing
               * the <text> ourselves from the box's x/y is the only form
               * that reliably renders — and the caption is the whole
               * point of the marker, since a bare dashed line says
               * something happened but not what.
               */
              label={({ viewBox }: { viewBox: { x: number; y: number } }) => (
                <text
                  x={viewBox.x + 4}
                  y={viewBox.y + 11}
                  fill={a.color}
                  fontSize={10}
                >
                  {a.label}
                </text>
              )}
            />
          ))}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={{ r: 1.5 }}
            connectNulls
            name={title}
          />
          {movingAverage && (
            <Line
              type="monotone"
              dataKey="ma7d"
              stroke={color}
              strokeOpacity={0.55}
              strokeWidth={2.5}
              dot={false}
              strokeDasharray="5 3"
              connectNulls
              name="7-day avg"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
