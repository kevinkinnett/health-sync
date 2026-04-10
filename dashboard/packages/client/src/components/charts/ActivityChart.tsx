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

interface Props {
  data: ActivityDay[];
}

export function ActivityChart({ data }: Props) {
  const chartData = data.map((d) => ({
    date: d.date,
    steps: d.steps,
    activeMinutes: (d.minutesFairlyActive ?? 0) + (d.minutesVeryActive ?? 0),
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Activity</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="steps" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="minutes" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip />
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
