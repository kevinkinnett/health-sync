import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SensorAgreementSeries } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";
import { SOURCE_COLOR } from "./chartPalette";
import type { ChartAnnotation } from "./annotations";
import { annotationMarkers } from "./annotationMarkers";

export function SensorAgreementChart({
  series,
  annotations = [],
}: {
  series: SensorAgreementSeries;
  annotations?: ChartAnnotation[];
}) {
  const ct = useChartTheme();
  const standardized = !series.measurementComparable;
  const data = series.points.map((point) => ({
    date: point.date,
    fitbit: standardized ? point.fitbitZ : point.fitbit,
    eightSleep: standardized ? point.eightSleepZ : point.eightSleep,
  }));

  return (
    <div className="h-56" role="img" aria-label={`${series.label} comparison over ${series.joinedDays} joined nights`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 6, left: 4 }}>
          {annotationMarkers(annotations)}
          <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={ct.tick} tickFormatter={(value: string) => value.slice(5)} minTickGap={24} />
          <YAxis
            tick={ct.tick}
            width={48}
            label={{
              value: standardized ? "z" : series.unit,
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 11, fill: ct.tick.fill },
            }}
          />
          <Tooltip
            contentStyle={ct.tooltip.contentStyle}
            labelStyle={ct.tooltip.labelStyle}
            itemStyle={ct.tooltip.itemStyle}
            formatter={(value) => [
              typeof value === "number" ? `${value.toFixed(standardized ? 2 : 1)}${standardized ? " z" : ` ${series.unit}`}` : value,
            ]}
          />
          <Legend />
          <Line
            dataKey="fitbit"
            name="Fitbit device via Google Health"
            stroke={SOURCE_COLOR.fitbit}
            strokeWidth={2}
            dot={{ r: 1.5 }}
          />
          <Line
            dataKey="eightSleep"
            name="Eight Sleep"
            stroke={SOURCE_COLOR.eightSleep}
            strokeWidth={2}
            dot={{ r: 1.5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
