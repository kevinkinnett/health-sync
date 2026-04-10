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

interface Props {
  data: ActivityDay[];
}

export function ActivityChart({ data }: Props) {
  const ct = useChartTheme();
  const chartData = data.map((d) => ({
    date: d.date,
    steps: d.steps,
    activeMinutes: (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">Activity</h3>
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
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            name="Steps"
          />
          <Area
            yAxisId="minutes"
            type="monotone"
            dataKey="activeMinutes"
            fill="#818cf8"
            fillOpacity={0.2}
            stroke="#818cf8"
            name="Active Min"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
