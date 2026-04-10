import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { HrvDay } from "@health-dashboard/shared";

interface Props {
  data: HrvDay[];
}

export function HrvChart({ data }: Props) {
  // Compute 7-day moving average for dailyRmssd
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-medium text-gray-500 mb-1">
        Heart Rate Variability (RMSSD)
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Higher HRV generally indicates better cardiovascular fitness and
        recovery. Deep sleep RMSSD reflects parasympathetic activity during
        restorative sleep.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis
            domain={["dataMin - 5", "dataMax + 10"]}
            tick={{ fontSize: 11 }}
            label={{
              value: "ms",
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 11, fill: "#9ca3af" },
            }}
          />
          <Tooltip
            formatter={(value: number) => [`${value} ms`]}
            labelStyle={{ fontWeight: 600 }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="dailyRmssd"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            dot={{ r: 1.5 }}
            connectNulls
            name="Daily RMSSD"
          />
          <Line
            type="monotone"
            dataKey="deepRmssd"
            stroke="#6366f1"
            strokeWidth={1.5}
            dot={{ r: 1.5 }}
            connectNulls
            name="Deep Sleep RMSSD"
          />
          <Line
            type="monotone"
            dataKey="ma7d"
            stroke="#7c3aed"
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
