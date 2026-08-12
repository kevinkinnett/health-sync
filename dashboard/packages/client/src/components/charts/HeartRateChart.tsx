import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { HeartRateDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";
import type { ChartAnnotation } from "./annotations";
import { annotationMarkers } from "./annotationMarkers";
import { movingAverage } from "../../utils/movingAverage";
import { METRIC_COLOR, SERIES } from "./chartPalette";

interface Props {
  data: HeartRateDay[];
  /** Vertical markers for dated changes (see `annotations.ts`). */
  annotations?: ChartAnnotation[];
}

export function HeartRateChart({ data, annotations = [] }: Props) {
  const ct = useChartTheme();
  const ma7 = movingAverage(data, (d) => d.restingHeartRate, 7);

  const chartData = data.map((d, i) => ({
    date: d.date,
    rhr: d.restingHeartRate,
    ma7d: ma7[i],
  }));

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-4">Resting Heart Rate</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          {annotationMarkers(annotations)}
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={ct.tick} />
          <Tooltip contentStyle={ct.tooltip.contentStyle} labelStyle={ct.tooltip.labelStyle} itemStyle={ct.tooltip.itemStyle} />
          <Line
            type="monotone"
            dataKey="rhr"
            stroke={METRIC_COLOR.restingHr}
            strokeWidth={1.5}
            dot={{ r: 2 }}
            name="RHR"
          />
          <Line
            type="monotone"
            dataKey="ma7d"
            stroke={SERIES[4]}
            strokeWidth={2}
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
