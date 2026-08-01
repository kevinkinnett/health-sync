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
import type { HrvDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";
import { formatWithUnit } from "./tooltipFormat";
import { METRIC_COLOR, SERIES } from "./chartPalette";

interface Props {
  data: HrvDay[];
}

/**
 * The day the Google Health API took over from the Fitbit Web API.
 *
 * Both lines on this chart step here, and neither step is physiological.
 * Fitbit computed RMSSD from beat-to-beat data; the replacement averages the
 * published 5-minute samples, which reads ~17% higher on the daily line and
 * ~7% higher on deep sleep. Readiness is unaffected — it scores HRV as a
 * z-score against a rolling personal baseline, which absorbs a level shift —
 * but somebody reading the raw line would otherwise see a June improvement
 * that never happened.
 */
const SOURCE_CHANGE_ON = "2026-06-12";

export function HrvChart({ data }: Props) {
  const ct = useChartTheme();

  const chartData = data.map((d, i) => {
    const window = data.slice(Math.max(0, i - 6), i + 1);
    const validValues = window
      .map((w) => w.dailyRmssd)
      .filter((v): v is number => v != null);
    const ma =
      validValues.length > 0
        ? Math.round(
            (validValues.reduce((a, b) => a + b, 0) / validValues.length) * 10,
          ) / 10
        : null;

    return {
      date: d.date,
      dailyRmssd: d.dailyRmssd != null ? Math.round(d.dailyRmssd * 10) / 10 : null,
      deepRmssd: d.deepRmssd != null ? Math.round(d.deepRmssd * 10) / 10 : null,
      ma7d: ma,
    };
  });

  // Only worth saying when the window actually spans the change. Recharts
  // anchors a ReferenceLine to a CATEGORY value, so a date the axis does not
  // contain draws nothing at best and in the wrong place at worst.
  const showSourceChange = chartData.some((d) => d.date === SOURCE_CHANGE_ON);

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-1">
        Heart Rate Variability (RMSSD)
      </h3>
      <p className="text-xs text-outline mb-4">
        Higher HRV generally indicates better cardiovascular fitness and
        recovery. Deep sleep RMSSD reflects parasympathetic activity during
        restorative sleep.
        {showSourceChange && (
          <>
            {" "}
            <span className="text-on-surface-variant" data-testid="hrv-source-caveat">
              Both lines step up on {SOURCE_CHANGE_ON}, when the data source
              changed — that jump is the measurement, not you.
            </span>
          </>
        )}
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis
            domain={["dataMin - 5", "dataMax + 10"]}
            tick={ct.tick}
            label={{
              value: "ms",
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 11, fill: ct.tick.fill },
            }}
          />
          <Tooltip
            contentStyle={ct.tooltip.contentStyle}
            labelStyle={{ ...ct.tooltip.labelStyle, fontWeight: 600 }}
            itemStyle={ct.tooltip.itemStyle}
            formatter={formatWithUnit("ms")}
          />
          <Legend />
          {showSourceChange && (
            <ReferenceLine
              x={SOURCE_CHANGE_ON}
              stroke={ct.tick.fill}
              strokeDasharray="4 3"
              // Render-function label: a VERTICAL reference line's viewBox has
              // zero width, so every position keyword resolves to nowhere and
              // the caption silently fails to draw.
              label={({ viewBox }: { viewBox: { x: number; y: number } }) => (
                <text x={viewBox.x + 4} y={viewBox.y + 11} fill={ct.tick.fill} fontSize={10}>
                  source change
                </text>
              )}
            />
          )}
          <Line
            type="monotone"
            dataKey="dailyRmssd"
            stroke={METRIC_COLOR.dailyRmssd}
            strokeWidth={1.5}
            dot={{ r: 1.5 }}
            connectNulls
            name="Daily RMSSD"
          />
          <Line
            type="monotone"
            dataKey="deepRmssd"
            stroke={METRIC_COLOR.deepMin}
            strokeWidth={1.5}
            dot={{ r: 1.5 }}
            connectNulls
            name="Deep Sleep RMSSD"
          />
          <Line
            type="monotone"
            dataKey="ma7d"
            stroke={SERIES[5]}
            strokeWidth={2.5}
            dot={false}
            strokeDasharray="5 3"
            connectNulls
            name="7-day avg"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
