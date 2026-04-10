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

interface Props {
  data: HeartRateDay[];
}

export function HeartRateChart({ data }: Props) {
  // Compute 7-day moving average
  const chartData = data.map((d, i) => {
    const window = data.slice(Math.max(0, i - 6), i + 1);
    const validValues = window
      .map((w) => w.restingHeartRate)
      .filter((v): v is number => v != null);
    const ma = validValues.length > 0
      ? Math.round(validValues.reduce((a, b) => a + b, 0) / validValues.length)
      : null;

    return {
      date: d.date,
      rhr: d.restingHeartRate,
      ma7d: ma,
    };
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Resting Heart Rate</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="rhr"
            stroke="#ef4444"
            strokeWidth={1.5}
            dot={{ r: 2 }}
            connectNulls
            name="RHR"
          />
          <Line
            type="monotone"
            dataKey="ma7d"
            stroke="#dc2626"
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
