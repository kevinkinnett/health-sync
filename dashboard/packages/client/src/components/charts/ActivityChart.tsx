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

interface Props {
  data: ActivityDay[];
}

export function ActivityChart({ data }: Props) {
  const ct = useChartTheme();
  const ma7 = movingAverage(data, (d) => d.steps, 7);
  const chartData = data.map((d, i) => ({
    date: d.date,
    steps: d.steps,
    activeMinutes: (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
    stepsMA: ma7[i],
  }));

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-4">Activity</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis yAxisId="steps" tick={ct.tick} />
          <YAxis yAxisId="minutes" orientation="right" tick={ct.tick} />
          <Tooltip contentStyle={ct.tooltip.contentStyle} labelStyle={ct.tooltip.labelStyle} itemStyle={ct.tooltip.itemStyle} />
          <Legend />
          <Line
            yAxisId="steps"
            type="monotone"
            dataKey="steps"
            stroke="#c0c1ff"
            strokeWidth={2}
            dot={false}
            name="Steps"
          />
          <Line
            yAxisId="steps"
            type="monotone"
            dataKey="stepsMA"
            stroke="#9b9dff"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
            connectNulls
            name="7-day avg"
          />
          <Area
            yAxisId="minutes"
            type="monotone"
            dataKey="activeMinutes"
            fill="#c0c1ff"
            fillOpacity={0.2}
            stroke="#c0c1ff"
            name="Active Min"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
